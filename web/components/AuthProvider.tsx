'use client';

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ApiError, type AuthSession, apiFetch, refreshSession } from '@/lib/api';

type AuthContextValue = {
  apiRequest: <T>(path: string, options?: RequestInit) => Promise<T>;
  beginAuthentication: () => Promise<string>;
  isAuthenticated: boolean;
  isHydrated: boolean;
  logout: () => Promise<void>;
  saveSession: (session: AuthSession, authenticationAttemptId: string) => Promise<void>;
  session: AuthSession | null;
};

const AuthContext = createContext<AuthContextValue | null>(null);
const STORAGE_KEY = 'kestrel.web.session';
const AUTHENTICATION_ATTEMPT_KEY = 'kestrel.web.authentication-attempt';
const AUTHENTICATION_EPOCH_KEY = 'kestrel.web.authentication-epoch';
const SESSION_LOCK_NAME = 'kestrel.web.session.lock';
const SESSION_FALLBACK_LOCK_KEY = 'kestrel.web.session-lock-lease';
const SESSION_FALLBACK_LOCK_LEASE_MS = 60_000;
const SESSION_FALLBACK_LOCK_RETRY_MS = 25;
const SESSION_REFRESH_TIMEOUT_MS = 15_000;
const SUPERSEDED_SESSION_REVOKE_TIMEOUT_MS = 10_000;

type RefreshInFlight = {
  promise: Promise<AuthSession>;
  refreshToken: string;
};

function withSessionLock<T>(action: () => T | Promise<T>): Promise<T> {
  if (navigator.locks == null) {
    return withFallbackSessionLock(action);
  }

  const abortController = new AbortController();
  const timeoutId = window.setTimeout(
    () => abortController.abort(),
    SESSION_FALLBACK_LOCK_LEASE_MS,
  );
  return navigator.locks
    .request(SESSION_LOCK_NAME, { signal: abortController.signal }, action)
    .finally(() => window.clearTimeout(timeoutId));
}

async function withFallbackSessionLock<T>(action: () => T | Promise<T>): Promise<T> {
  const owner = createOperationId();
  const acquisitionDeadline = Date.now() + SESSION_FALLBACK_LOCK_LEASE_MS;

  while (Date.now() < acquisitionDeadline) {
    const lease = readFallbackLockLease();
    if (lease == null || lease.expiresAt <= Date.now()) {
      window.localStorage.setItem(
        SESSION_FALLBACK_LOCK_KEY,
        JSON.stringify({
          expiresAt: Date.now() + SESSION_FALLBACK_LOCK_LEASE_MS,
          owner,
        }),
      );
      await delay(SESSION_FALLBACK_LOCK_RETRY_MS);
      if (readFallbackLockLease()?.owner === owner) {
        try {
          return await action();
        } finally {
          if (readFallbackLockLease()?.owner === owner) {
            window.localStorage.removeItem(SESSION_FALLBACK_LOCK_KEY);
          }
        }
      }
    }
    await delay(SESSION_FALLBACK_LOCK_RETRY_MS);
  }

  throw new ApiError('Timed out waiting for another tab to finish authentication', 503);
}

function readFallbackLockLease(): { expiresAt: number; owner: string } | null {
  const serialized = window.localStorage.getItem(SESSION_FALLBACK_LOCK_KEY);
  if (serialized == null) {
    return null;
  }

  try {
    const lease = JSON.parse(serialized) as { expiresAt?: unknown; owner?: unknown };
    return typeof lease.expiresAt === 'number' && typeof lease.owner === 'string'
      ? { expiresAt: lease.expiresAt, owner: lease.owner }
      : null;
  } catch {
    return null;
  }
}

function createOperationId(): string {
  const randomValues = new Uint32Array(4);
  crypto.getRandomValues(randomValues);
  return Array.from(randomValues, (value) => value.toString(16).padStart(8, '0')).join('');
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

async function refreshSessionWithRetry(refreshToken: string): Promise<AuthSession> {
  const refreshRequestId = getOrCreateRefreshRequestId(refreshToken);
  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const abortController = new AbortController();
    const timeoutId = window.setTimeout(() => abortController.abort(), SESSION_REFRESH_TIMEOUT_MS);
    try {
      return await refreshSession(refreshToken, refreshRequestId, abortController.signal);
    } catch (error) {
      lastError = error;
      if (error instanceof ApiError && error.status < 500) {
        throw error;
      }
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  throw lastError;
}

function getOrCreateRefreshRequestId(refreshToken: string): string {
  const storedSession = readStoredSession();
  if (
    storedSession?.refreshToken === refreshToken &&
    typeof storedSession.refreshRequestId === 'string'
  ) {
    return storedSession.refreshRequestId;
  }

  const refreshRequestId = createOperationId();
  if (storedSession?.refreshToken === refreshToken) {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...storedSession, refreshRequestId }),
    );
  }
  return refreshRequestId;
}

function waitForStoredSessionChange(
  refreshToken: string,
  timeoutMs = 2_000,
): Promise<AuthSession | null> {
  const currentSession = readStoredSession();
  if (currentSession?.refreshToken !== refreshToken) {
    return Promise.resolve(currentSession);
  }

  return new Promise((resolve) => {
    const timeoutId = window.setTimeout(() => finish(), timeoutMs);
    function finish() {
      window.removeEventListener('storage', handleStorage);
      window.clearTimeout(timeoutId);
      resolve(readStoredSession());
    }
    function handleStorage(event: StorageEvent) {
      if (event.key === STORAGE_KEY && readStoredSession()?.refreshToken !== refreshToken) {
        finish();
      }
    }
    window.addEventListener('storage', handleStorage);
  });
}

function readStoredSession(): AuthSession | null {
  try {
    const serialized = window.localStorage.getItem(STORAGE_KEY);
    if (serialized == null) {
      return null;
    }

    const value = JSON.parse(serialized) as Partial<AuthSession>;
    return typeof value.accessToken === 'string' &&
      typeof value.refreshToken === 'string' &&
      typeof value.session?.id === 'string' &&
      typeof value.user?.id === 'string'
      ? (value as AuthSession)
      : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);
  const sessionRef = useRef<AuthSession | null>(null);
  const refreshInFlightRef = useRef<RefreshInFlight | null>(null);

  const persistSession = useCallback((nextSession: AuthSession) => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextSession));
    sessionRef.current = nextSession;
    setSession(nextSession);
  }, []);

  const beginAuthentication = useCallback(() => {
    return withSessionLock(() => {
      const epoch = window.localStorage.getItem(AUTHENTICATION_EPOCH_KEY) ?? 'initial';
      const attemptId = `${epoch}:${createOperationId()}`;
      window.localStorage.setItem(AUTHENTICATION_ATTEMPT_KEY, attemptId);
      return attemptId;
    });
  }, []);

  const saveSession = useCallback(
    async (nextSession: AuthSession, authenticationAttemptId: string) => {
      let persistenceError: unknown;
      let saved = false;
      try {
        saved = await withSessionLock(() => {
          if (window.localStorage.getItem(AUTHENTICATION_ATTEMPT_KEY) !== authenticationAttemptId) {
            return false;
          }
          window.localStorage.removeItem(AUTHENTICATION_ATTEMPT_KEY);
          persistSession({
            ...nextSession,
            refreshRequestId: nextSession.refreshRequestId ?? createOperationId(),
          });
          const [attemptEpoch] = authenticationAttemptId.split(':', 1);
          const currentEpoch = window.localStorage.getItem(AUTHENTICATION_EPOCH_KEY) ?? 'initial';
          if (currentEpoch !== attemptEpoch) {
            if (readStoredSession()?.refreshToken === nextSession.refreshToken) {
              window.localStorage.removeItem(STORAGE_KEY);
              sessionRef.current = null;
              setSession(null);
            }
            return false;
          }
          return true;
        });
      } catch (error) {
        persistenceError = error;
      }
      if (saved) {
        return;
      }

      const abortController = new AbortController();
      const timeoutId = window.setTimeout(
        () => abortController.abort(),
        SUPERSEDED_SESSION_REVOKE_TIMEOUT_MS,
      );
      try {
        await apiFetch('/auth/session/revoke', {
          accessToken: nextSession.accessToken,
          body: '{}',
          method: 'POST',
          signal: abortController.signal,
        });
      } catch {
        // The superseded credentials are discarded even if cleanup is offline.
      } finally {
        window.clearTimeout(timeoutId);
      }
      if (persistenceError instanceof Error) {
        throw persistenceError;
      }
      throw new ApiError('A newer sign-in attempt replaced this one', 409);
    },
    [persistSession],
  );

  const clearSession = useCallback((expectedRefreshToken?: string): boolean => {
    if (expectedRefreshToken != null) {
      const storedSession = readStoredSession();
      if (
        sessionRef.current?.refreshToken !== expectedRefreshToken ||
        (storedSession != null && storedSession.refreshToken !== expectedRefreshToken)
      ) {
        return false;
      }
    }

    let storageCleared = true;
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      storageCleared = false;
    } finally {
      sessionRef.current = null;
      setSession(null);
    }
    return storageCleared;
  }, []);

  const refreshSessionOnce = useCallback((sessionToRefresh: AuthSession) => {
    const inFlight = refreshInFlightRef.current;
    if (inFlight?.refreshToken === sessionToRefresh.refreshToken) {
      return inFlight.promise;
    }

    const promise = refreshSessionWithRetry(sessionToRefresh.refreshToken).finally(() => {
      window.setTimeout(() => {
        if (refreshInFlightRef.current?.promise === promise) {
          refreshInFlightRef.current = null;
        }
      }, 0);
    });
    refreshInFlightRef.current = {
      promise,
      refreshToken: sessionToRefresh.refreshToken,
    };
    return promise;
  }, []);

  const refreshAndSaveSession = useCallback(
    (sessionToRefresh: AuthSession): Promise<AuthSession> => {
      const refreshUnderLock = async () => {
        const authenticationEpoch =
          window.localStorage.getItem(AUTHENTICATION_EPOCH_KEY) ?? 'initial';
        const storedBeforeRefresh = readStoredSession();
        if (storedBeforeRefresh?.refreshToken !== sessionToRefresh.refreshToken) {
          if (storedBeforeRefresh?.session.id === sessionToRefresh.session.id) {
            persistSession(storedBeforeRefresh);
            return storedBeforeRefresh;
          }
          throw new ApiError('Authentication changed while refreshing session', 401);
        }

        const refreshedSession = await refreshSessionOnce(sessionToRefresh);
        if (
          (window.localStorage.getItem(AUTHENTICATION_EPOCH_KEY) ?? 'initial') !==
          authenticationEpoch
        ) {
          throw new ApiError('Authentication changed while refreshing session', 401);
        }
        const storedAfterRefresh = readStoredSession();
        const currentSession = sessionRef.current;
        const currentReplacement =
          currentSession != null && currentSession.refreshToken !== sessionToRefresh.refreshToken
            ? currentSession
            : null;
        const storedReplacement =
          storedAfterRefresh != null &&
          storedAfterRefresh.refreshToken !== sessionToRefresh.refreshToken
            ? storedAfterRefresh
            : null;
        const replacementSession = currentReplacement ?? storedReplacement;

        if (replacementSession != null) {
          if (replacementSession.session.id !== sessionToRefresh.session.id) {
            throw new ApiError('Authentication changed while refreshing session', 401);
          }
          persistSession(replacementSession);
          return replacementSession;
        }
        if (storedAfterRefresh == null) {
          throw new ApiError('Authentication changed while refreshing session', 401);
        }

        const persistedRefreshedSession = {
          ...refreshedSession,
          refreshRequestId: storedAfterRefresh.refreshRequestId,
        };
        persistSession(persistedRefreshedSession);
        if (
          (window.localStorage.getItem(AUTHENTICATION_EPOCH_KEY) ?? 'initial') !==
          authenticationEpoch
        ) {
          clearSession(persistedRefreshedSession.refreshToken);
          throw new ApiError('Authentication changed while refreshing session', 401);
        }
        return persistedRefreshedSession;
      };

      return withSessionLock(refreshUnderLock);
    },
    [clearSession, persistSession, refreshSessionOnce],
  );

  useEffect(() => {
    const parsedSession = readStoredSession();

    if (parsedSession == null) {
      try {
        window.localStorage.removeItem(STORAGE_KEY);
      } catch {
        // Treat unavailable storage as signed out.
      }
      setIsHydrated(true);
      return;
    }

    sessionRef.current = parsedSession;

    // Verify the stored session by refreshing its access token before we
    // expose `isAuthenticated = true`. Without this, a stale or
    // server-rejected session would let `LoginPage` redirect to
    // `/dashboard`, which then bounces back to `/login` once the first
    // protected request 401s. During that loop the login form is
    // technically mounted but its tab buttons feel unclickable because
    // the router is mid-navigation.
    let cancelled = false;

    refreshAndSaveSession(parsedSession)
      .then(() => {
        // The coordinated refresh persists the session while holding the
        // cross-tab lock. The effect only controls hydration UI state.
      })
      .catch(async (error: unknown) => {
        if (cancelled) {
          return;
        }

        // Only drop the stored session when the backend explicitly
        // rejected the refresh token. Network errors / 5xx keep it so a
        // transient outage doesn't sign the user out.
        if (error instanceof ApiError && error.status === 401 && navigator.locks == null) {
          const replacementSession = await waitForStoredSessionChange(parsedSession.refreshToken);
          if (
            replacementSession != null &&
            replacementSession.refreshToken !== parsedSession.refreshToken
          ) {
            persistSession(replacementSession);
            return;
          }
        }

        await withSessionLock(() => {
          const latestStoredSession = readStoredSession();
          if (latestStoredSession?.refreshToken !== parsedSession.refreshToken) {
            if (latestStoredSession != null) {
              persistSession(latestStoredSession);
            }
            return;
          }

          if (error instanceof ApiError && error.status === 401) {
            clearSession(parsedSession.refreshToken);
            return;
          }

          persistSession(latestStoredSession ?? parsedSession);
        });
      })
      .finally(() => {
        if (!cancelled) {
          setIsHydrated(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [clearSession, persistSession, refreshAndSaveSession]);

  useEffect(() => {
    function syncSessionFromAnotherTab(event: StorageEvent) {
      if (event.key !== STORAGE_KEY) {
        return;
      }

      const previousSessionId = sessionRef.current?.session.id;
      const storedSession = readStoredSession();
      if (storedSession == null) {
        sessionRef.current = null;
        setSession(null);
        if (window.location.pathname.startsWith('/dashboard')) {
          window.location.assign('/login');
        }
        return;
      }
      if (storedSession.session.id !== previousSessionId) {
        window.location.reload();
        return;
      }
      sessionRef.current = storedSession;
      setSession(storedSession);
    }

    window.addEventListener('storage', syncSessionFromAnotherTab);
    return () => window.removeEventListener('storage', syncSessionFromAnotherTab);
  }, []);

  const logout = useCallback(async () => {
    let sessionToRevoke = sessionRef.current;
    try {
      window.localStorage.setItem(AUTHENTICATION_EPOCH_KEY, createOperationId());
      sessionToRevoke = readStoredSession() ?? sessionRef.current;
      window.localStorage.removeItem(AUTHENTICATION_ATTEMPT_KEY);
    } catch {
      try {
        window.localStorage.removeItem(AUTHENTICATION_ATTEMPT_KEY);
      } catch {
        // A blocked store also prevents the pending attempt from saving.
      }
    } finally {
      clearSession();
    }
    void withSessionLock(() => {
      if (sessionToRevoke != null) {
        clearSession(sessionToRevoke.refreshToken);
      }
    }).catch(() => {
      // Local logout already completed; the lease timeout is self-healing.
    });

    if (sessionToRevoke == null) {
      return;
    }

    try {
      await apiFetch('/auth/session/revoke', {
        accessToken: sessionToRevoke.accessToken,
        body: '{}',
        method: 'POST',
      });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        try {
          const refreshedSession = await refreshSessionWithRetry(sessionToRevoke.refreshToken);
          await apiFetch('/auth/session/revoke', {
            accessToken: refreshedSession.accessToken,
            body: '{}',
            method: 'POST',
          });
        } catch {
          // Local logout still completes if the backend cannot be reached.
        }
      }
    }
  }, [clearSession]);

  const apiRequest = useCallback(
    async <T,>(path: string, options: RequestInit = {}): Promise<T> => {
      const requestSession = sessionRef.current;
      if (requestSession == null) {
        throw new ApiError('Not authenticated', 401);
      }

      const requestForSession = async (activeSession: AuthSession) => {
        const response = await apiFetch<T>(path, {
          ...options,
          accessToken: activeSession.accessToken,
        });
        if (sessionRef.current?.session.id !== activeSession.session.id) {
          throw new ApiError('Authentication changed while processing request', 401);
        }
        return response;
      };

      try {
        return await requestForSession(requestSession);
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 401) {
          throw error;
        }

        const latestSession = sessionRef.current;
        if (latestSession == null) {
          throw new ApiError('Not authenticated', 401);
        }

        if (latestSession.refreshToken !== requestSession.refreshToken) {
          if (latestSession.session.id !== requestSession.session.id) {
            throw new ApiError('Authentication changed while retrying request', 401);
          }

          return requestForSession(latestSession);
        }

        let refreshedSession: AuthSession;
        try {
          refreshedSession = await refreshAndSaveSession(requestSession);
        } catch (refreshError) {
          if (refreshError instanceof ApiError && refreshError.status === 401) {
            if (navigator.locks == null) {
              const replacementSession = await waitForStoredSessionChange(
                requestSession.refreshToken,
              );
              if (
                replacementSession != null &&
                replacementSession.refreshToken !== requestSession.refreshToken
              ) {
                if (replacementSession.session.id !== requestSession.session.id) {
                  throw new ApiError('Authentication changed while retrying request', 401);
                }
                persistSession(replacementSession);
                return requestForSession(replacementSession);
              }
            }

            const concurrentlyRefreshedSession = await withSessionLock(() => {
              const storedSession = readStoredSession();
              if (
                storedSession != null &&
                storedSession.refreshToken !== requestSession.refreshToken
              ) {
                if (storedSession.session.id !== requestSession.session.id) {
                  throw new ApiError('Authentication changed while retrying request', 401);
                }
                persistSession(storedSession);
                return storedSession;
              }
              clearSession(requestSession.refreshToken);
              return null;
            });
            if (concurrentlyRefreshedSession != null) {
              return requestForSession(concurrentlyRefreshedSession);
            }
          }
          throw refreshError;
        }

        return requestForSession(refreshedSession);
      }
    },
    [clearSession, persistSession, refreshAndSaveSession],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      apiRequest,
      beginAuthentication,
      isAuthenticated: session != null,
      isHydrated,
      logout,
      saveSession,
      session,
    }),
    [apiRequest, beginAuthentication, isHydrated, logout, saveSession, session],
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
