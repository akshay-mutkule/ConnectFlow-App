import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { User } from 'firebase/auth';
import { subscribeToAuth, signInWithGoogle, logoutUser } from '../lib/firebase';
import { apiRequest } from '../lib/api';
import { IntegrationState, UserProfile } from '../types';

interface AuthContextValue {
  firebaseUser: User | null;
  profile: UserProfile | null;
  integrations: IntegrationState | null;
  loading: boolean;
  authError: string | null;
  signIn: () => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [integrations, setIntegrations] = useState<IntegrationState | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  const refreshProfile = useCallback(async () => {
    try {
      const data = await apiRequest<{
        user: UserProfile;
        integrations: IntegrationState;
      }>('/api/me');
      setProfile(data.user);
      setIntegrations(data.integrations);
      setAuthError(null);
    } catch (err: any) {
      console.error('Failed to sync profile:', err);
      setAuthError(err.message || 'Unable to connect to workspace server.');
    }
  }, []);

  useEffect(() => {
    const unsub = subscribeToAuth(async (user) => {
      setFirebaseUser(user);
      if (user) {
        await refreshProfile();
      } else {
        setProfile(null);
        setIntegrations(null);
      }
      setLoading(false);
    });
    return () => unsub();
  }, [refreshProfile]);

  const signIn = async () => {
    setAuthError(null);
    try {
      await signInWithGoogle();
    } catch (err: any) {
      setAuthError(err.message || 'Sign-in was cancelled or failed.');
    }
  };

  const logout = async () => {
    await logoutUser();
    setProfile(null);
    setIntegrations(null);
  };

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        profile,
        integrations,
        loading,
        authError,
        signIn,
        logout,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
