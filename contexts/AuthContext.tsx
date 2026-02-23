import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { 
  User, 
  signInWithPopup, 
  signInWithRedirect, 
  getRedirectResult, 
  signOut, 
  onAuthStateChanged, 
  AuthProvider as FirebaseAuthProvider, 
  setPersistence, 
  browserLocalPersistence,
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink
} from 'firebase/auth';
import { auth, googleProvider, db } from '../services/firebase';
import { setStorageUserId, loadRemoteData } from '../services/storageService';
import { setUsageUserId, loadRemoteUsage, checkAndResetDailyCredits, getUsage, clearLocalUsage } from '../services/usageService';
import { logAuthEvent } from '../services/auditService';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { AppUser, UserRole } from '../types';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { Icon } from '../components/Icon';
import { getTranslation } from '../services/translations';
import { loadSettings } from '../services/storageService';

const SESSION_DURATION_DAYS = 30;

interface AuthContextType {
  user: AppUser | null;
  loading: boolean;
  sessionExpiry: Date | null;
  signInWithGoogle: () => Promise<void>;
  signInWithProvider: (provider: FirebaseAuthProvider) => Promise<void>;
  sendEmailLink: (email: string) => Promise<void>;
  finishEmailSignIn: (email: string, href: string) => Promise<void>;
  logout: () => Promise<void>;
  deleteAccount: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRedirectChecking, setIsRedirectChecking] = useState(true);
  const [isAuthInitialized, setIsAuthInitialized] = useState(false);
  const [sessionExpiry, setSessionExpiry] = useState<Date | null>(null);
  
  const t = (key: string) => {
    const settings = loadSettings();
    return getTranslation(key, settings.language);
  };

  // Handle redirect result (for mobile logins)
  useEffect(() => {
    const initAuth = async () => {
        // Helper for retrying redirect result
        const tryGetRedirectResult = async (retries = 3, delay = 1000): Promise<any> => {
            for (let i = 0; i < retries; i++) {
                try {
                    const result = await getRedirectResult(auth);
                    if (result) return result;
                } catch (error: any) {
                    console.error(`AuthContext: Redirect attempt ${i + 1} failed:`, error.message);
                    // Certain errors like 'auth/redirect-cancelled-by-user' should stop retries
                    if (error.code === 'auth/redirect-cancelled-by-user') break;
                }
                await new Promise(resolve => setTimeout(resolve, delay * (i + 1)));
            }
            return null;
        };

        try {
            // Force persistence
            await setPersistence(auth, browserLocalPersistence);
            
            // Check for redirect flag
            const isRedirecting = localStorage.getItem('firebase_auth_in_progress') === 'true';
            
            // If we are on mobile and just came back from a redirect, be very patient
            const result = await tryGetRedirectResult(isRedirecting ? 4 : 1, 800);
            
            if (result && result.user) {
                logAuthEvent(result.user.uid, 'login');
                sessionStorage.setItem(`session_logged_${result.user.uid}`, 'true');
            }
        } catch (error: any) {
            console.error("AuthContext: Final redirect check error:", error);
        } finally {
            // IMPORTANT: Only remove flag if we are sure we're done or if it's been too long
            localStorage.removeItem('firebase_auth_in_progress');
            setIsRedirectChecking(false);
        }
    };

    initAuth();
  }, []);

  // Combined loading state management
  useEffect(() => {
    // Determine if we should be loading
    const isActuallyLoading = !isAuthInitialized || isRedirectChecking;
    
    if (!isActuallyLoading) {
        // If we have no user and we're NOT in a redirect, we show landing
        // But on iPhone we want to be EXTREMELY conservative.
        const isRedirecting = localStorage.getItem('firebase_auth_in_progress') === 'true';
        
        // If we suspect a redirect is happening, wait much longer (up to 10 seconds)
        // This gives the slow mobile browser time to finish the auth background tasks.
        const delay = user ? 300 : (isRedirecting ? 10000 : 3500); 
        
        const timer = setTimeout(() => {
            // Final check: if we still have no user but the flag is STILL there, 
            // it means Firebase might have failed silently.
            setLoading(false);
        }, delay);
        return () => clearTimeout(timer);
    } else {
        setLoading(true);
    }
  }, [isAuthInitialized, isRedirectChecking, user]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      // Mark as not initialized while we process the new auth state
      setIsAuthInitialized(false);
      
      try {
        if (currentUser) {
          // Check stored expiration
          const storedExpiry = localStorage.getItem('session_expiry');
          const now = new Date();

          if (storedExpiry) {
              const expiryDate = new Date(storedExpiry);
              if (expiryDate < now) {
                  await signOut(auth);
                  setStorageUserId(null);
                  setUsageUserId(null);
                  setUser(null);
                  setSessionExpiry(null);
                  localStorage.removeItem('session_expiry');
                  return;
              }
          }

          // Extension and data loading logic...
          const newExpiry = new Date();
          newExpiry.setDate(newExpiry.getDate() + SESSION_DURATION_DAYS);
          localStorage.setItem('session_expiry', newExpiry.toISOString());
          setSessionExpiry(newExpiry);

          setStorageUserId(currentUser.uid);
          setUsageUserId(currentUser.uid, currentUser.email);

          const sessionKey = `session_logged_${currentUser.uid}`;
          const shouldLogSession = !sessionStorage.getItem(sessionKey);

          const userRef = doc(db, 'users', currentUser.uid);
          const userSnap = await getDoc(userRef);
          
          const baseData: any = {
              email: currentUser.email,
              displayName: currentUser.displayName,
              photoURL: currentUser.photoURL,
              lastLogin: new Date()
          };
          
          if (!userSnap.exists() || !userSnap.data()?.role) {
              baseData.role = 'user';
          }

          await setDoc(userRef, baseData, { merge: true });

          const remoteDataResults = await Promise.allSettled([
              getDoc(doc(db, 'users', currentUser.uid)),
              loadRemoteData(currentUser.uid),
              loadRemoteUsage(currentUser.uid)
          ]);

          await checkAndResetDailyCredits(getUsage(), currentUser.uid);

          if (shouldLogSession) {
              logAuthEvent(currentUser.uid, 'session_start');
              sessionStorage.setItem(sessionKey, 'true');
          }
          
          let role: UserRole = 'user';
          let isBanned = false;
          let hasSeenWelcome = false;
          
          const docSnapResult = remoteDataResults[0];
          if (docSnapResult.status === 'fulfilled' && docSnapResult.value && docSnapResult.value.exists()) {
              const userData = docSnapResult.value.data();
              if (userData.role) role = userData.role as UserRole;
              if (userData.isBanned) isBanned = true;
              if (userData.hasSeenWelcome) hasSeenWelcome = true;
          }

          setUser({
              uid: currentUser.uid,
              email: currentUser.email,
              displayName: currentUser.displayName,
              photoURL: currentUser.photoURL,
              role: role,
              isBanned: isBanned,
              hasSeenWelcome: hasSeenWelcome
          });
        } else {
          setStorageUserId(null);
          setUsageUserId(null);
          setUser(null);
          setSessionExpiry(null);
          
          // CRITICAL: Only clear if we are NOT in a redirect check
          if (!isRedirectChecking && localStorage.getItem('firebase_auth_in_progress') !== 'true') {
              console.log("AuthContext: No user and no redirect in progress, performing cleanup.");
              const keysToKeep = ['theme', 'weather_app_settings'];
              const keys = Object.keys(localStorage);
              keys.forEach(key => {
                  if (!keysToKeep.includes(key) && !key.startsWith('firebase:')) {
                      localStorage.removeItem(key);
                  }
              });
          } else {
              console.log("AuthContext: No user found but redirect is in progress, skipping cleanup.");
          }
        }
      } catch (error) {
         console.error("AuthContext: Error during initialization", error);
         if (currentUser) {
            setUser({
                uid: currentUser.uid,
                email: currentUser.email,
                displayName: currentUser.displayName,
                photoURL: currentUser.photoURL,
                role: 'user',
                isBanned: false,
                hasSeenWelcome: false
            });
         }
       } finally {
        setIsAuthInitialized(true);
      }
    });
    return () => unsubscribe();
  }, []);

  const signInWithGoogle = async () => {
    try {
      setLoading(true);
      await setPersistence(auth, browserLocalPersistence);
      googleProvider.setCustomParameters({ prompt: 'select_account' });
      
      // Force popup on all devices (including mobile) to avoid iOS redirect context loss
      console.log('AuthContext: Forcing signInWithPopup...');
      const result = await signInWithPopup(auth, googleProvider);
      
      if (result.user) {
        localStorage.setItem('firebase_auth_in_progress', 'false');
        await logAuthEvent(result.user.uid, 'login');
        sessionStorage.setItem(`session_logged_${result.user.uid}`, 'true');
      }
    } catch (error: any) {
      console.error('AuthContext: Login error:', error);
      localStorage.setItem('firebase_auth_in_progress', 'false');
      
      // Handle specific popup errors
      if (error.code === 'auth/popup-blocked') {
        alert('De login popup is geblokkeerd door je browser. Sta popups toe voor deze site om in te loggen.');
      } else if (error.code === 'auth/popup-closed-by-user') {
        console.log('Login geannuleerd door gebruiker');
      } else {
        alert(`Login fout: ${error.message}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const signInWithProvider = async (provider: FirebaseAuthProvider) => {
    try {
      setLoading(true);
      await setPersistence(auth, browserLocalPersistence);

      // Force popup on all devices
      console.log('AuthContext: Forcing signInWithPopup for provider...');
      const result = await signInWithPopup(auth, provider);
      
      if (result.user) {
        localStorage.setItem('firebase_auth_in_progress', 'false');
        await logAuthEvent(result.user.uid, 'login');
        sessionStorage.setItem(`session_logged_${result.user.uid}`, 'true');
      }
    } catch (error: any) {
      console.error('AuthContext: Provider login error:', error);
      localStorage.setItem('firebase_auth_in_progress', 'false');
      
      if (error.code === 'auth/popup-blocked') {
        alert('De login popup is geblokkeerd. Sta popups toe om in te loggen.');
      } else {
        alert(`Login fout: ${error.message}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const sendEmailLink = async (email: string) => {
     try {
       setLoading(true);
       const actionCodeSettings = {
         // Dit is de URL waar de gebruiker terechtkomt na het klikken op de link in de mail.
         // Zorg dat deze route '/finish-login' bestaat in de router!
         url: 'https://askbaro.com/finish-login',
         
         // Dit zorgt ervoor dat de link op mobiel direct de app/PWA probeert te openen
         handleCodeInApp: true,
       };
 
       await sendSignInLinkToEmail(auth, email, actionCodeSettings);
       
       // Save the email locally so you don't need to ask the user for it again
       // if they open the link on the same device.
       window.localStorage.setItem('emailForSignIn', email);
       
       alert('Check je mail! Klik op de link om in te loggen.');
     } catch (error: any) {
      console.error('AuthContext: sendEmailLink error:', error);
      alert(`Fout bij verzenden link: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const finishEmailSignIn = async (email: string, href: string) => {
    try {
      setLoading(true);
      if (isSignInWithEmailLink(auth, href)) {
        const result = await signInWithEmailLink(auth, email, href);
        if (result.user) {
          window.localStorage.removeItem('emailForSignIn');
          await logAuthEvent(result.user.uid, 'login');
          sessionStorage.setItem(`session_logged_${result.user.uid}`, 'true');
        }
      }
    } catch (error: any) {
      console.error('AuthContext: finishEmailSignIn error:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    try {
      if (user) {
          logAuthEvent(user.uid, 'logout');
          sessionStorage.removeItem(`session_logged_${user.uid}`);
      }
      await signOut(auth);
      setStorageUserId(null);
      setUsageUserId(null);
      // Secure cleanup: Remove app-specific data but keep generic preferences
      const keysToKeep = ['theme', 'weather_app_settings'];
      const keys = Object.keys(localStorage);
      keys.forEach(key => {
          if (!keysToKeep.includes(key) && !key.startsWith('firebase:')) {
              localStorage.removeItem(key);
          }
      });
      setSessionExpiry(null);
    } catch (error) {
      console.error("Error signing out", error);
    }
  };

  const deleteAccount = async () => {
    try {
      if (user) {
        logAuthEvent(user.uid, 'account_delete');
        await user.delete();
        setStorageUserId(null);
        setUsageUserId(null);
        localStorage.removeItem('session_expiry');
        setSessionExpiry(null);
      }
    } catch (error) {
      console.error("Error deleting account", error);
      throw error;
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, sessionExpiry, signInWithGoogle, signInWithProvider, sendEmailLink, finishEmailSignIn, logout, deleteAccount }}>
      {user?.isBanned ? (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-bg-page/80 backdrop-blur-xl animate-in fade-in">
          <div className="bg-bg-card text-text-main w-full max-w-md rounded-3xl overflow-hidden relative flex flex-col shadow-2xl animate-in zoom-in-95 duration-200 border border-red-500/30">
            <div className="p-8 text-center flex flex-col items-center gap-6">
              <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center text-red-500">
                <Icon name="lock" className="w-10 h-10" />
              </div>
              
              <div className="space-y-2">
                <h2 className="text-2xl font-bold text-text-main">
                  {t('banned.title')}
                </h2>
                <p className="text-text-muted leading-relaxed">
                  {t('banned.message')}
                </p>
              </div>

              <div className="w-full pt-4 border-t border-border-color">
                <p className="text-sm text-text-muted mb-2">Support:</p>
                <a 
                  href={`mailto:${t('banned.support_email')}`}
                  className="text-blue-400 hover:text-blue-300 transition-colors font-medium"
                >
                  {t('banned.support_email')}
                </a>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {loading ? (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-bg-main">
            <div className="flex flex-col items-center gap-4">
                <LoadingSpinner />
                <p className="text-text-muted animate-pulse">Baro gegevens ophalen...</p>
                {localStorage.getItem('firebase_auth_in_progress') === 'true' && (
                  <p className="text-xs text-text-muted/60 animate-bounce mt-2">Bezig met Google authenticatie, een moment geduld...</p>
                )}
            </div>
        </div>
      ) : children}
    </AuthContext.Provider>
  );
};
