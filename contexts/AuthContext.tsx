import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, signInWithPopup, signOut, onAuthStateChanged, AuthProvider as FirebaseAuthProvider } from 'firebase/auth';
import { auth, googleProvider, db } from '../services/firebase';
import { setStorageUserId, loadRemoteData } from '../services/storageService';
import { setUsageUserId, loadRemoteUsage, checkAndResetDailyCredits, getUsage } from '../services/usageService';
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
  const [sessionExpiry, setSessionExpiry] = useState<Date | null>(null);
  
  const t = (key: string) => {
    const settings = loadSettings();
    return getTranslation(key, settings.language);
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        // Check stored expiration
        const storedExpiry = localStorage.getItem('session_expiry');
        const now = new Date();

        if (storedExpiry) {
            const expiryDate = new Date(storedExpiry);
            if (expiryDate < now) {
                // Session expired
                console.log("AuthContext: Session expired");
                await signOut(auth);
                setStorageUserId(null);
                setUsageUserId(null);
                setUser(null);
                setSessionExpiry(null);
                localStorage.removeItem('session_expiry');
                setLoading(false);
                return;
            }
        }

        // If we are here, session is valid or new.
        // We extend the session by X days from NOW (sliding window)
        const newExpiry = new Date();
        newExpiry.setDate(newExpiry.getDate() + SESSION_DURATION_DAYS);
        
        localStorage.setItem('session_expiry', newExpiry.toISOString());
        setSessionExpiry(newExpiry);

     // Sync with Firestore
            setStorageUserId(currentUser.uid);
            setUsageUserId(currentUser.uid, currentUser.email);
        
            // Sync basic user info to Firestore for Admin/Baro usage
            try {
                await setDoc(doc(db, 'users', currentUser.uid), {
                    email: currentUser.email,
                    displayName: currentUser.displayName,
                    photoURL: currentUser.photoURL,
                    lastLogin: new Date()
                }, { merge: true });
            } catch (e) {
                console.error("AuthContext: Error syncing user to Firestore", e);
            }

        // Audit Log: Session Start (if new browser session)
        const sessionKey = `session_logged_${currentUser.uid}`;
        if (!sessionStorage.getItem(sessionKey)) {
            logAuthEvent(currentUser.uid, 'session_start');
            sessionStorage.setItem(sessionKey, 'true');
        }

        let role: UserRole = 'user';
        let isBanned = false;
        try {
          // Load remote data (settings, usage)
          // We wait for this so the app renders with correct settings
          const [docSnap] = await Promise.all([
              getDoc(doc(db, 'users', currentUser.uid)),
              loadRemoteData(currentUser.uid),
              loadRemoteUsage(currentUser.uid)
          ]);

          // Daily Credit Check (Login Hook)
          await checkAndResetDailyCredits(getUsage(), currentUser.uid);

          if (docSnap.exists()) {
              const userData = docSnap.data();
              if (userData.role) {
                  role = userData.role as UserRole;
              }
              if (userData.isBanned) {
                  isBanned = true;
              }
          }
        } catch (error) {
          console.error("AuthContext: Error loading remote data", error);
        }

        setUser({
            uid: currentUser.uid,
            email: currentUser.email,
            displayName: currentUser.displayName,
            photoURL: currentUser.photoURL,
            role: role,
            isBanned: isBanned
        });
      } else {
        setStorageUserId(null);
        setUsageUserId(null);
        setUser(null);
        setSessionExpiry(null);
        localStorage.removeItem('session_expiry');
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const signInWithGoogle = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      if (result.user) {
          await logAuthEvent(result.user.uid, 'login');
          // Mark session as logged to avoid duplicate session_start log
          sessionStorage.setItem(`session_logged_${result.user.uid}`, 'true');
      }
      // Expiry will be set in onAuthStateChanged
    } catch (error) {
      console.error("Error signing in with Google", error);
      throw error;
    }
  };

  const signInWithProvider = async (provider: FirebaseAuthProvider) => {
    try {
      const result = await signInWithPopup(auth, provider);
      if (result.user) {
          await logAuthEvent(result.user.uid, 'login');
          sessionStorage.setItem(`session_logged_${result.user.uid}`, 'true');
      }
    } catch (error) {
      console.error("Error signing in with provider", error);
      throw error;
    }
  };

  const logout = async () => {
    try {
      if (user) {
          await logAuthEvent(user.uid, 'logout');
          sessionStorage.removeItem(`session_logged_${user.uid}`);
      }
      await signOut(auth);
      setStorageUserId(null);
      setUsageUserId(null);
      localStorage.removeItem('session_expiry');
      setSessionExpiry(null);
    } catch (error) {
      console.error("Error signing out", error);
    }
  };

  const deleteAccount = async () => {
    try {
      if (user) {
        await logAuthEvent(user.uid, 'account_delete');
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
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl animate-in fade-in">
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
      {loading ? <LoadingSpinner /> : children}
    </AuthContext.Provider>
  );
};
