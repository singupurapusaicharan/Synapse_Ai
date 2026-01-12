/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { apiClient } from '@/lib/api/client';

export interface User {
  id: string;
  email: string;
  full_name?: string;
  created_at?: string;
}

export interface Session {
  token: string;
  user: User;
  expires_at?: string;
}

function isUser(value: unknown): value is User {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v.id === 'string' && typeof v.email === 'string';
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, fullName?: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = async () => {
    try {
      const token = localStorage.getItem('auth_token');
      if (!token) return;

      const response = await apiClient.getCurrentUser();
      const nextUser = response.data?.user;
      if (isUser(nextUser)) {
        setUser(nextUser);
        setSession({ token, user: nextUser });
      }
    } catch (error) {
      console.error('[useAuth] refreshUser error:', error);
    }
  };

  useEffect(() => {
    // Check for existing session on mount
    const checkSession = async () => {
      try {
        const token = localStorage.getItem('auth_token');
        console.log('[useAuth] Checking session, token in localStorage:', !!token);

        if (token) {
          console.log('[useAuth] Using token, fetching user info...');
          const response = await apiClient.getCurrentUser();
          
          const nextUser = response.data?.user;
          if (isUser(nextUser)) {
            console.log('[useAuth] User authenticated:', nextUser.email);
            setUser(nextUser);
            setSession({
              token,
              user: nextUser,
            });
          } else {
            console.warn('[useAuth] Invalid token response, clearing token');
            localStorage.removeItem('auth_token');
          }
        } else {
          console.log('[useAuth] No token found in storage or cookie');
        }
      } catch (error) {
        console.error('[useAuth] Error checking session:', error);
        // Clear invalid token if any
        localStorage.removeItem('auth_token');
      } finally {
        console.log('[useAuth] Session check complete, loading finished');
        setLoading(false);
      }
    };

    checkSession();
  }, []);

  const signIn = async (email: string, password: string) => {
    try {
      const response = await apiClient.signIn(email, password);
      if (response.error) {
        return { error: new Error(response.error) };
      }
      const nextUser = response.data?.user;
      if (response.data?.token && isUser(nextUser)) {
        localStorage.setItem('auth_token', response.data.token);
        setUser(nextUser);
        setSession({
          token: response.data.token,
          user: nextUser,
        });
        return { error: null };
      }
      return { error: new Error('Invalid response from server') };
    } catch (error) {
      return { error: error instanceof Error ? error : new Error('Sign in failed') };
    }
  };

  const signUp = async (email: string, password: string, fullName?: string) => {
    try {
      const response = await apiClient.signUp(email, password, fullName);
      if (response.error) {
        return { error: new Error(response.error) };
      }
      const nextUser = response.data?.user;
      if (response.data?.token && isUser(nextUser)) {
        localStorage.setItem('auth_token', response.data.token);
        setUser(nextUser);
        setSession({
          token: response.data.token,
          user: nextUser,
        });
        return { error: null };
      }
      return { error: new Error('Invalid response from server') };
    } catch (error) {
      return { error: error instanceof Error ? error : new Error('Sign up failed') };
    }
  };

  const signOut = async () => {
    try {
      await apiClient.signOut();
    } catch (error) {
      console.error('Sign out error:', error);
    } finally {
      localStorage.removeItem('auth_token');
      setUser(null);
      setSession(null);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        signIn,
        signUp,
        signOut,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
