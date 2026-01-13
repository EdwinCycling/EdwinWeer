import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, signInWithPopup, signOut, onAuthStateChanged, AuthProvider as FirebaseAuthProvider } from 'firebase/auth';
import { auth, googleProvider } from '../services/firebase';
import { setStorageUserId, loadRemoteData } from '../services/storageService';
import { setUsageUserId, loadRemoteUsage } from '../services/usageService';
import { logAuthEvent } from '../services/auditService';
import { LoadingSpinner } from '../components/LoadingSpinner';

const SESSION_DURATION_DAYS = 30;

interface AuthContextType {
  user: User | null;
  loading: boolean;
  sessionExpiry: Date | null;
  signInWithGoogle: () => Promise<void>;
  signInWithProvider: (provider: FirebaseAuthProvider) => Promise<void>;
  logout: () => Promise<void>;
  deleteAccount: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionExpiry, setSessionExpiry] = useState<Date | null>(null);

  useEffect(() => {
    console.log("AuthContext: Setting up onAuthStateChanged");
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      console.log("AuthContext: onAuthStateChanged fired", currentUser?.uid || "no user");
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
        
        // Audit Log: Session Start (if new browser session)
        const sessionKey = `session_logged_${currentUser.uid}`;
        if (!sessionStorage.getItem(sessionKey)) {
            logAuthEvent(currentUser.uid, 'session_start');
            sessionStorage.setItem(sessionKey, 'true');
        }

        try {
          console.log("AuthContext: Loading remote data for", currentUser.uid);
          // Load remote data (settings, usage)
          // We wait for this so the app renders with correct settings
          await Promise.all([
              loadRemoteData(currentUser.uid),
              loadRemoteUsage(currentUser.uid)
          ]);
          console.log("AuthContext: Remote data loaded");
        } catch (error) {
          console.error("AuthContext: Error loading remote data", error);
        }

        setUser(currentUser);
      } else {
        setStorageUserId(null);
        setUsageUserId(null);
        setUser(null);
        setSessionExpiry(null);
        localStorage.removeItem('session_expiry');
      }
      setLoading(false);
      console.log("AuthContext: loading set to false");
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

  console.log("AuthContext: Rendering provider", { loading });
  return (
    <AuthContext.Provider value={{ user, loading, sessionExpiry, signInWithGoogle, signInWithProvider, logout, deleteAccount }}>
      {loading ? <LoadingSpinner /> : children}
    </AuthContext.Provider>
  );
};
