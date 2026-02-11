import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, signInWithPopup, signInWithRedirect, getRedirectResult, signOut, onAuthStateChanged, AuthProvider as FirebaseAuthProvider, setPersistence, browserLocalPersistence } from 'firebase/auth';
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
        console.log("AuthContext: Starting robust auth initialization...");
        try {
            // Force persistence
            await setPersistence(auth, browserLocalPersistence);
            
            // Check for redirect flag
            const isRedirecting = localStorage.getItem('firebase_auth_in_progress') === 'true';
            if (isRedirecting) {
                console.log("AuthContext: Redirect detected, holding state...");
            }

            const result = await getRedirectResult(auth);
            if (result && result.user) {
                console.log("AuthContext: Successfully logged in via Redirect!", result.user.uid);
                logAuthEvent(result.user.uid, 'login');
                sessionStorage.setItem(`session_logged_${result.user.uid}`, 'true');
            } else {
                console.log("AuthContext: No redirect result found or already processed.");
            }
        } catch (error: any) {
            console.error("AuthContext: Redirect check error:", error);
            // On some mobile browsers, we might need a retry or just wait for onAuthStateChanged
        } finally {
            localStorage.removeItem('firebase_auth_in_progress');
            setIsRedirectChecking(false);
            console.log("AuthContext: Redirect check finished.");
        }
    };

    initAuth();
  }, []);

  // Combined loading state management
  useEffect(() => {
    // Determine if we should be loading
    const isActuallyLoading = !isAuthInitialized || isRedirectChecking;
    
    if (!isActuallyLoading) {
        // Even if Firebase says it's done, wait a tiny bit to avoid UI flickering
        // especially on mobile where state transitions can be multiple.
        const delay = user ? 400 : 1000; // Wait longer if no user to be absolutely sure
        const timer = setTimeout(() => {
            setLoading(false);
            console.log(`AuthContext: Finalizing loading state (User: ${user?.uid || 'none'})`);
        }, delay);
        return () => clearTimeout(timer);
    } else {
        setLoading(true);
    }
  }, [isAuthInitialized, isRedirectChecking, user]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      console.log("AuthContext: Auth state changed:", currentUser?.uid || 'null');
      
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
                  console.log("AuthContext: Session expired");
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
      // Check if mobile
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      
      if (isMobile) {
        localStorage.setItem('firebase_auth_in_progress', 'true');
        await signInWithRedirect(auth, googleProvider);
        // Page will redirect, so no need to handle result here immediately
      } else {
        const result = await signInWithPopup(auth, googleProvider);
        if (result.user) {
            await logAuthEvent(result.user.uid, 'login');
            // Mark session as logged to avoid duplicate session_start log
            sessionStorage.setItem(`session_logged_${result.user.uid}`, 'true');
        }
      }
      // Expiry will be set in onAuthStateChanged
    } catch (error) {
      console.error("Error signing in with Google", error);
      throw error;
    }
  };

  const signInWithProvider = async (provider: FirebaseAuthProvider) => {
    try {
      // Check if mobile
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

      if (isMobile) {
         // Robustness: Set a flag so we know to wait longer on reload
         localStorage.setItem('firebase_auth_in_progress', 'true');
         await signInWithRedirect(auth, provider);
      } else {
        const result = await signInWithPopup(auth, provider);
        if (result.user) {
            await logAuthEvent(result.user.uid, 'login');
            sessionStorage.setItem(`session_logged_${result.user.uid}`, 'true');
        }
      }
    } catch (error) {
      console.error("Error signing in with provider", error);
      throw error;
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
    <AuthContext.Provider value={{ user, loading, sessionExpiry, signInWithGoogle, signInWithProvider, logout, deleteAccount }}>
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
            </div>
        </div>
      ) : children}
    </AuthContext.Provider>
  );
};
