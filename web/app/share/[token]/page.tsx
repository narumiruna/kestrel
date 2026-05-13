'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { ApiError, type Route, type SharedRouteSnapshot, apiFetch } from '@/lib/api';

const RouteMapPreview = dynamic(() => import('@/components/RouteMapPreview'), {
  ssr: false,
});

export default function SharedRoutePage() {
  const auth = useAuth();
  const router = useRouter();
  const params = useParams<{ token: string }>();
  const token = typeof params.token === 'string' ? params.token : '';
  const [sharedRoute, setSharedRoute] = useState<SharedRouteSnapshot | null>(null);
  const [copiedRoute, setCopiedRoute] = useState<Route | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [isCopying, setIsCopying] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (token.length === 0) {
      setError('Invalid share link');
      setIsLoading(false);
      return;
    }

    setError(null);
    setIsLoading(true);
    void apiFetch<SharedRouteSnapshot>(`/shares/${token}`)
      .then((result) => {
        setSharedRoute(result);
      })
      .catch((nextError: unknown) => {
        setError(formatError(nextError));
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [token]);

  async function copyToLibrary() {
    if (!auth.isAuthenticated) {
      router.push('/login');
      return;
    }

    setCopyError(null);
    setIsCopying(true);

    try {
      const result = await auth.apiRequest<Route>(`/shares/${token}/copy`, {
        method: 'POST',
      });
      setCopiedRoute(result);
    } catch (nextError) {
      setCopyError(formatError(nextError));
    } finally {
      setIsCopying(false);
    }
  }

  return (
    <main className="shell stack">
      <header className="topbar">
        <div className="brand">
          <strong>Kestrel Share</strong>
          <span className="muted">Public latest-route link</span>
        </div>
        <div className="row">
          <Link href={auth.isAuthenticated ? '/dashboard' : '/login'}>
            {auth.isAuthenticated ? 'Back to dashboard' : 'Sign in'}
          </Link>
        </div>
      </header>

      {isLoading ? <p className="muted">Loading shared route…</p> : null}
      {error == null ? null : <div className="error">{error}</div>}

      {sharedRoute == null || isLoading ? null : (
        <section className="grid">
          <article className="panel stack">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <div>
                <h1 style={{ marginBottom: '0.25rem' }}>{sharedRoute.route.name}</h1>
                <p className="muted" style={{ margin: 0 }}>
                  rev {sharedRoute.route.revision.revisionNumber} · {sharedRoute.route.revision.defaultSpeedKmh}{' '}
                  km/h · {formatMode(sharedRoute.route.revision.mode)}
                </p>
              </div>
              <span className="chip">public link</span>
            </div>
            {sharedRoute.route.description == null ? null : <p>{sharedRoute.route.description}</p>}
            <RouteMapPreview waypoints={sharedRoute.route.revision.waypoints} />
            <div className="chip-row">
              <span className="chip">
                {sharedRoute.route.revision.waypoints.length} waypoint
                {sharedRoute.route.revision.waypoints.length === 1 ? '' : 's'}
              </span>
              <span className="chip">{formatMode(sharedRoute.route.revision.mode)}</span>
              <span className="chip">{sharedRoute.route.revision.defaultSpeedKmh} km/h</span>
            </div>
          </article>

          <article className="panel stack">
            <h2>Copy to your library</h2>
            <p className="muted" style={{ margin: 0 }}>
              This copies the currently visible snapshot into your own cloud library as a new route.
            </p>
            {copyError == null ? null : <div className="error">{copyError}</div>}
            {copiedRoute == null ? null : (
              <div className="success">
                Copied as <strong>{copiedRoute.name}</strong>.{' '}
                <Link href="/dashboard">Open dashboard</Link>
              </div>
            )}
            <div className="row">
              <button disabled={isCopying} type="button" onClick={() => void copyToLibrary()}>
                {isCopying
                  ? 'Copying…'
                  : auth.isAuthenticated
                    ? 'Copy to my library'
                    : 'Sign in to copy'}
              </button>
            </div>
          </article>
        </section>
      )}
    </main>
  );
}

function formatMode(mode: SharedRouteSnapshot['route']['revision']['mode']) {
  return mode === 'PING_PONG' ? 'PingPong' : mode[0] + mode.slice(1).toLowerCase();
}

function formatError(error: unknown): string {
  if (error instanceof ApiError || error instanceof Error) {
    return error.message;
  }

  return 'Unexpected error';
}
