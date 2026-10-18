'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
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
import { errorMessage } from '@/i18n/errors';
import { ApiError } from '@/lib/api';

type CallbackError = {
  key: 'sessionExpired' | 'cancelled' | 'failed' | 'saveFailed' | 'incomplete' | 'exchangeFailed';
  cause?: unknown;
};

export default function OidcLinkCallbackPage() {
  const t = useTranslations('Account.oidcCallback');
  const errorT = useTranslations('Errors');
  const auth = useAuth();
  const router = useRouter();
  const startedRef = useRef(false);
  const [error, setError] = useState<CallbackError | null>(null);
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
        setError({ key: 'exchangeFailed', cause: nextError });
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
        setError({ key: 'sessionExpired' });
        setIsCompleting(false);
        return;
      }

      const clientNonce = readOidcLinkAttempt();
      const callback = await parseOidcLinkCallback(window.location.hash, clientNonce);
      if (callback.type === 'error') {
        window.history.replaceState(null, '', window.location.pathname);
        clearOidcLinkState();
        setError({ key: callback.errorCode === 'access_denied' ? 'cancelled' : 'failed' });
        setIsCompleting(false);
        return;
      }
      if (callback.type === 'success' && clientNonce != null) {
        const pending = { clientNonce, exchangeTicket: callback.exchangeTicket };
        if (!saveOidcLinkExchange(pending)) {
          setError({ key: 'saveFailed' });
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
      setError({ key: 'incomplete' });
      setIsCompleting(false);
    })();
  }, [auth.isAuthenticated, auth.isHydrated, completeExchange]);

  return (
    <main className="auth-page">
      <section className="card auth-card stack" aria-live="polite">
        <BrandMark className="auth-brand" subtitle={t('title')} titleAs="h1" />
        {error == null ? (
          <p className="muted">{t('loading')}</p>
        ) : (
          <>
            <div className="error" role="alert">
              {error.cause == null
                ? t(error.key)
                : errorMessage(error.cause, (key, values) =>
                    ['unexpected', 'http', 'server'].includes(key)
                      ? t(error.key)
                      : errorT(key, values),
                  )}
            </div>
            {pendingExchange != null ? (
              <Button
                disabled={isCompleting}
                onClick={() => void completeExchange(pendingExchange)}
              >
                {t('retry')}
              </Button>
            ) : null}
            <Button asChild className="secondary">
              <Link href="/dashboard/account" onClick={clearOidcLinkState}>
                {t('back')}
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
