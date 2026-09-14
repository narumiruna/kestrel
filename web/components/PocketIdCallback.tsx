'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { BrandMark } from '@/components/BrandMark';
import { Button } from '@/components/ui/radix-ui';
import { exchangePocketId } from '@/lib/api';

export function PocketIdCallback() {
  const auth = useAuth();
  const router = useRouter();
  const startedRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (startedRef.current) {
      return;
    }
    startedRef.current = true;
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    window.history.replaceState(null, '', window.location.pathname);
    const keys = Array.from(fragment.keys());
    const errorCodes = fragment.getAll('error');
    const tickets = fragment.getAll('ticket');
    if (keys.length === 1 && errorCodes.length === 1 && tickets.length === 0) {
      setError(describeCallbackError(errorCodes[0]));
      return;
    }
    const ticket = tickets.length === 1 ? tickets[0] : null;
    const authenticationAttempt = auth.getAuthenticationAttempt();
    if (
      keys.length !== 1 ||
      ticket == null ||
      !/^[A-Za-z0-9_-]{32,128}$/.test(ticket) ||
      authenticationAttempt == null
    ) {
      setError('Pocket ID returned an incomplete sign-in response. Please try again.');
      return;
    }

    exchangePocketId(ticket, authenticationAttempt)
      .then(async (session) => {
        await auth.saveSession(session, authenticationAttempt);
        router.replace('/dashboard');
      })
      .catch((nextError: unknown) => {
        setError(nextError instanceof Error ? nextError.message : 'Pocket ID sign-in failed');
      });
  }, [auth, router]);

  return (
    <main className="auth-page">
      <section className="card auth-card stack" aria-live="polite">
        <BrandMark className="auth-brand" subtitle="Completing secure sign-in." titleAs="h1" />
        {error == null ? (
          <p className="muted">Completing Pocket ID sign-in…</p>
        ) : (
          <>
            <div className="error" role="alert">
              {error}
            </div>
            <Button asChild className="secondary">
              <Link href="/login">Return to login</Link>
            </Button>
          </>
        )}
      </section>
    </main>
  );
}

function describeCallbackError(errorCode: string): string {
  if (errorCode === 'access_denied') {
    return 'Pocket ID sign-in was cancelled.';
  }
  return 'Pocket ID could not complete sign-in. Please try again.';
}
