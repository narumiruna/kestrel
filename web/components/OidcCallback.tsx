'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { BrandMark } from '@/components/BrandMark';
import { Button } from '@/components/ui/radix-ui';
import { ApiError, exchangeOidc } from '@/lib/api';

type PendingOidcExchange = {
  authenticationAttempt: string;
  ticket: string;
};

const EXCHANGE_STORAGE_KEY = 'kestrel.web.oidc-exchange';
const EXCHANGE_VALUE_PATTERN = /^[A-Za-z0-9:._-]{16,128}$/;
const TICKET_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;

export function OidcCallback() {
  const auth = useAuth();
  const router = useRouter();
  const startedRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [isCompleting, setIsCompleting] = useState(true);
  const [pendingExchange, setPendingExchange] = useState<PendingOidcExchange | null>(null);

  const completeExchange = useCallback(
    async (pending: PendingOidcExchange) => {
      setError(null);
      setIsCompleting(true);
      try {
        const session = await exchangeOidc(pending.ticket, pending.authenticationAttempt);
        await auth.saveSession(session, pending.authenticationAttempt);
        clearPendingExchange();
        setPendingExchange(null);
        router.replace('/dashboard');
      } catch (nextError) {
        if (isDefinitiveExchangeError(nextError)) {
          clearPendingExchange();
          setPendingExchange(null);
        }
        setError(nextError instanceof Error ? nextError.message : 'OIDC sign-in failed');
      } finally {
        setIsCompleting(false);
      }
    },
    [auth, router],
  );

  useEffect(() => {
    if (startedRef.current) {
      return;
    }
    startedRef.current = true;

    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const keys = Array.from(fragment.keys());
    if (keys.length > 0) {
      const errorCodes = fragment.getAll('error');
      const tickets = fragment.getAll('ticket');
      if (keys.length === 1 && errorCodes.length === 1 && tickets.length === 0) {
        window.history.replaceState(null, '', window.location.pathname);
        clearPendingExchange();
        setError(describeCallbackError(errorCodes[0]));
        setIsCompleting(false);
        return;
      }

      const ticket = tickets.length === 1 ? tickets[0] : null;
      const authenticationAttempt = auth.getAuthenticationAttempt();
      if (
        keys.length !== 1 ||
        ticket == null ||
        !TICKET_PATTERN.test(ticket) ||
        authenticationAttempt == null ||
        !EXCHANGE_VALUE_PATTERN.test(authenticationAttempt)
      ) {
        window.history.replaceState(null, '', window.location.pathname);
        clearPendingExchange();
        setError('OIDC returned an incomplete sign-in response. Please try again.');
        setIsCompleting(false);
        return;
      }

      const pending = { authenticationAttempt, ticket };
      if (!savePendingExchange(pending)) {
        setError('Could not save the OIDC response. Reload this page to retry.');
        setIsCompleting(false);
        return;
      }
      window.history.replaceState(null, '', window.location.pathname);
      setPendingExchange(pending);
      void completeExchange(pending);
      return;
    }

    const pending = readPendingExchange();
    if (pending == null || auth.getAuthenticationAttempt() !== pending.authenticationAttempt) {
      clearPendingExchange();
      setError('OIDC returned an incomplete sign-in response. Please try again.');
      setIsCompleting(false);
      return;
    }
    setPendingExchange(pending);
    void completeExchange(pending);
  }, [auth, completeExchange]);

  return (
    <main className="auth-page">
      <section className="card auth-card stack" aria-live="polite">
        <BrandMark className="auth-brand" subtitle="Completing secure sign-in." titleAs="h1" />
        {error == null ? (
          <p className="muted">Completing OIDC sign-in…</p>
        ) : (
          <>
            <div className="error" role="alert">
              {error}
            </div>
            {pendingExchange != null ? (
              <Button
                disabled={isCompleting}
                onClick={() => void completeExchange(pendingExchange)}
              >
                Retry sign-in
              </Button>
            ) : null}
            <Button asChild className="secondary">
              <Link href="/login" onClick={clearPendingExchange}>
                Return to login
              </Link>
            </Button>
          </>
        )}
      </section>
    </main>
  );
}

function isDefinitiveExchangeError(error: unknown): boolean {
  return error instanceof ApiError && [400, 409, 410].includes(error.status);
}

function readPendingExchange(): PendingOidcExchange | null {
  try {
    const serialized = window.sessionStorage.getItem(EXCHANGE_STORAGE_KEY);
    if (serialized == null) {
      return null;
    }
    const value = JSON.parse(serialized) as Partial<PendingOidcExchange>;
    return typeof value.authenticationAttempt === 'string' &&
      EXCHANGE_VALUE_PATTERN.test(value.authenticationAttempt) &&
      typeof value.ticket === 'string' &&
      TICKET_PATTERN.test(value.ticket)
      ? { authenticationAttempt: value.authenticationAttempt, ticket: value.ticket }
      : null;
  } catch {
    return null;
  }
}

function savePendingExchange(pending: PendingOidcExchange): boolean {
  try {
    window.sessionStorage.setItem(EXCHANGE_STORAGE_KEY, JSON.stringify(pending));
    return true;
  } catch {
    return false;
  }
}

function clearPendingExchange(): void {
  try {
    window.sessionStorage.removeItem(EXCHANGE_STORAGE_KEY);
  } catch {
    // There is no recoverable storage state to clear when tab storage is unavailable.
  }
}

function describeCallbackError(errorCode: string): string {
  if (errorCode === 'access_denied') {
    return 'OIDC sign-in was cancelled.';
  }
  return 'OIDC could not complete sign-in. Please try again.';
}
