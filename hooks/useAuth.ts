import { createContext, useContext } from 'react';
import { AppUser } from '../types';
import { AuthProvider as FirebaseAuthProvider } from 'firebase/auth';

export interface AuthContextType {
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

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
