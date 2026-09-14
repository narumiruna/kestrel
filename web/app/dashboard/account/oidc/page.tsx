'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { BrandMark } from '@/components/BrandMark';
import {
  clearOidcLinkState,
  type PendingOidcLinkExchange,
  parseOidcLinkCallback,
  readOidcLinkAttempt,
  readOidcLinkExchange,
  saveOidcLinkExchange,
} from '@/components/dashboard/oidcLinkState';
import { Button } from '@/components/ui/radix-ui';
import { ApiError } from '@/lib/api';

export default function OidcLinkCallbackPage() {
  const auth = useAuth();
  const router = useRouter();
  const startedRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [isCompleting, setIsCompleting] = useState(true);
  const [pendingExchange, setPendingExchange] = useState<PendingOidcLinkExchange | null>(null);

  const completeExchange = useCallback(
    async (pending: PendingOidcLinkExchange) => {
      setError(null);
      setIsCompleting(true);
      try {
        await auth.apiRequest('/auth/oidc/link/exchange', {
          body: JSON.stringify({
            clientNonce: pending.clientNonce,
            exchangeTicket: pending.exchangeTicket,
          }),
          method: 'POST',
        });
        clearOidcLinkState();
        setPendingExchange(null);
        router.replace('/dashboard/account?oidc=linked');
      } catch (nextError) {
        if (isDefinitiveExchangeError(nextError)) {
          clearOidcLinkState();
          setPendingExchange(null);
        }
        setError(nextError instanceof Error ? nextError.message : 'OIDC linking failed');
      } finally {
        setIsCompleting(false);
      }
    },
    [auth, router],
  );

  useEffect(() => {
    if (!auth.isHydrated || startedRef.current) {
      return;
    }
    startedRef.current = true;

    void (async () => {
      if (!auth.isAuthenticated) {
        clearOidcLinkState();
        setError('Your Kestrel session is no longer active. Sign in and start linking again.');
        setIsCompleting(false);
        return;
      }

      const clientNonce = readOidcLinkAttempt();
      const callback = await parseOidcLinkCallback(window.location.hash, clientNonce);
      if (callback.type === 'error') {
        window.history.replaceState(null, '', window.location.pathname);
        clearOidcLinkState();
        setError(
          callback.errorCode === 'access_denied'
            ? 'OIDC linking was cancelled.'
            : 'OIDC could not complete account linking. Please try again.',
        );
        setIsCompleting(false);
        return;
      }
      if (callback.type === 'success' && clientNonce != null) {
        const pending = { clientNonce, exchangeTicket: callback.exchangeTicket };
        if (!saveOidcLinkExchange(pending)) {
          setError('Could not save the OIDC response. Reload this page to retry.');
          setIsCompleting(false);
          return;
        }
        window.history.replaceState(null, '', window.location.pathname);
        setPendingExchange(pending);
        await completeExchange(pending);
        return;
      }
      if (callback.type === 'none') {
        const pending = readOidcLinkExchange();
        if (pending != null && pending.clientNonce === clientNonce) {
          setPendingExchange(pending);
          await completeExchange(pending);
          return;
        }
      }

      window.history.replaceState(null, '', window.location.pathname);
      clearOidcLinkState();
      setError('OIDC returned an incomplete account-linking response. Please try again.');
      setIsCompleting(false);
    })();
  }, [auth.isAuthenticated, auth.isHydrated, completeExchange]);

  return (
    <main className="auth-page">
      <section className="card auth-card stack" aria-live="polite">
        <BrandMark className="auth-brand" subtitle="Linking a sign-in method." titleAs="h1" />
        {error == null ? (
          <p className="muted">Completing OIDC account linking…</p>
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
                Retry linking
              </Button>
            ) : null}
            <Button asChild className="secondary">
              <Link href="/dashboard/account" onClick={clearOidcLinkState}>
                Return to account security
              </Link>
            </Button>
          </>
        )}
      </section>
    </main>
  );
}

function isDefinitiveExchangeError(error: unknown): boolean {
  return error instanceof ApiError && [400, 401, 409, 410].includes(error.status);
}
