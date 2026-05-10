'use client';

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { ApiError, type AuthSession, apiFetch, refreshSession } from '@/lib/api';

type AuthContextValue = {
  apiRequest: <T>(path: string, options?: RequestInit) => Promise<T>;
  isAuthenticated: boolean;
  isHydrated: boolean;
  logout: () => void;
  saveSession: (session: AuthSession) => void;
  session: AuthSession | null;
};

const AuthContext = createContext<AuthContextValue | null>(null);
const STORAGE_KEY = 'kestrel.web.session';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    const storedSession = window.localStorage.getItem(STORAGE_KEY);

    if (storedSession != null) {
      try {
        setSession(JSON.parse(storedSession) as AuthSession);
      } catch {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    }

    setIsHydrated(true);
  }, []);

  const saveSession = useCallback((nextSession: AuthSession) => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextSession));
    setSession(nextSession);
  }, []);

  const logout = useCallback(() => {
    window.localStorage.removeItem(STORAGE_KEY);
    setSession(null);
  }, []);

  const apiRequest = useCallback(
    async <T,>(path: string, options: RequestInit = {}): Promise<T> => {
      if (session == null) {
        throw new ApiError('Not authenticated', 401);
      }

      try {
        return await apiFetch<T>(path, {
          ...options,
          accessToken: session.accessToken,
        });
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 401) {
          throw error;
        }

        let refreshedSession: AuthSession;

        try {
          refreshedSession = await refreshSession(session.refreshToken);
        } catch (refreshError) {
          logout();
          throw refreshError;
        }

        saveSession(refreshedSession);

        return apiFetch<T>(path, {
          ...options,
          accessToken: refreshedSession.accessToken,
        });
      }
    },
    [logout, saveSession, session],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      apiRequest,
      isAuthenticated: session != null,
      isHydrated,
      logout,
      saveSession,
      session,
    }),
    [apiRequest, isHydrated, logout, saveSession, session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (context == null) {
    throw new Error('useAuth must be used within AuthProvider');
  }

  return context;
}
