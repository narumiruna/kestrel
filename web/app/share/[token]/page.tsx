'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import {
  ApiError,
  apiFetch,
  type Place,
  type Route,
  type SharedRouteSnapshot,
  type SharedSnapshot,
} from '@/lib/api';

const PlaceMapPreview = dynamic(() => import('@/components/PlaceMapPreview'), {
  ssr: false,
});
const RouteMapPreview = dynamic(() => import('@/components/RouteMapPreview'), {
  ssr: false,
});

export default function SharedItemPage() {
  const auth = useAuth();
  const router = useRouter();
  const params = useParams<{ token: string }>();
  const token = typeof params.token === 'string' ? params.token : '';
  const [sharedItem, setSharedItem] = useState<SharedSnapshot | null>(null);
  const [copiedItem, setCopiedItem] = useState<Place | Route | null>(null);
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
    void apiFetch<SharedSnapshot>(`/shares/${token}`)
      .then((result) => {
        setSharedItem(result);
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

    if (sharedItem == null) {
      setCopyError('Shared item is not loaded yet');
      return;
    }

    setCopyError(null);
    setIsCopying(true);

    try {
      const result = await auth.apiRequest<Place | Route>(`/shares/${token}/copy`, {
        body: JSON.stringify(getCopyBody(sharedItem)),
        method: 'POST',
      });
      setCopiedItem(result);
    } catch (nextError) {
      setCopyError(formatError(nextError));
    } finally {
      setIsCopying(false);
    }
  }

  const dashboardHref = getDashboardHref(sharedItem);
  const itemLabel = sharedItem?.kind === 'PLACE' ? 'place' : 'route';

  return (
    <main className="shell stack">
      <header className="topbar">
        <div className="brand">
          <strong>Kestrel Share</strong>
          <span className="muted">Public {itemLabel} link</span>
        </div>
        <div className="row">
          <Link href={auth.isAuthenticated ? dashboardHref : '/login'}>
            {auth.isAuthenticated ? `Back to ${itemLabel}s` : 'Sign in'}
          </Link>
        </div>
      </header>

      {isLoading ? <p className="muted">Loading shared item…</p> : null}
      {error == null ? null : <div className="error">{error}</div>}

      {sharedItem == null || isLoading ? null : (
        <section className="grid">
          {sharedItem.kind === 'PLACE' ? (
            <SharedPlaceCard sharedItem={sharedItem} />
          ) : (
            <SharedRouteCard sharedItem={sharedItem} />
          )}

          <article className="panel stack">
            <h2>Copy to your library</h2>
            <p className="muted" style={{ margin: 0 }}>
              This copies the visible {itemLabel} into your own cloud library.
            </p>
            {copyError == null ? null : <div className="error">{copyError}</div>}
            {copiedItem == null ? null : (
              <div className="success">
                Copied as <strong>{copiedItem.name}</strong>. <Link href={dashboardHref}>Open</Link>
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

function SharedPlaceCard({
  sharedItem,
}: {
  sharedItem: Extract<SharedSnapshot, { kind: 'PLACE' }>;
}) {
  return (
    <article className="panel stack">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ marginBottom: '0.25rem' }}>{sharedItem.place.name}</h1>
          <p className="muted" style={{ margin: 0 }}>
            {formatCoord(sharedItem.place.latitude)}, {formatCoord(sharedItem.place.longitude)}
          </p>
        </div>
        <span className="chip">public place</span>
      </div>
      {sharedItem.place.description == null ? null : <p>{sharedItem.place.description}</p>}
      <PlaceMapPreview
        latitude={sharedItem.place.latitude}
        longitude={sharedItem.place.longitude}
      />
      <div className="chip-row">
        {sharedItem.place.tags.length === 0 ? (
          <span className="chip">place</span>
        ) : (
          sharedItem.place.tags.map((tag) => (
            <span className="chip" key={tag}>
              {tag}
            </span>
          ))
        )}
      </div>
    </article>
  );
}

function SharedRouteCard({ sharedItem }: { sharedItem: SharedRouteSnapshot }) {
  return (
    <article className="panel stack">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ marginBottom: '0.25rem' }}>{sharedItem.route.name}</h1>
          <p className="muted" style={{ margin: 0 }}>
            rev {sharedItem.route.revision.revisionNumber} ·{' '}
            {sharedItem.route.revision.defaultSpeedKmh} km/h ·{' '}
            {formatMode(sharedItem.route.revision.mode)}
          </p>
        </div>
        <span className="chip">public route</span>
      </div>
      {sharedItem.route.description == null ? null : <p>{sharedItem.route.description}</p>}
      <RouteMapPreview waypoints={sharedItem.route.revision.waypoints} />
      <div className="chip-row">
        <span className="chip">
          {sharedItem.route.revision.waypoints.length} waypoint
          {sharedItem.route.revision.waypoints.length === 1 ? '' : 's'}
        </span>
        <span className="chip">{formatMode(sharedItem.route.revision.mode)}</span>
        <span className="chip">{sharedItem.route.revision.defaultSpeedKmh} km/h</span>
      </div>
    </article>
  );
}

function getCopyBody(sharedItem: SharedSnapshot) {
  if (sharedItem.kind === 'PLACE') {
    return {};
  }

  return {
    routeRevisionId: sharedItem.route.revision.id,
  };
}

function getDashboardHref(sharedItem: SharedSnapshot | null) {
  return sharedItem?.kind === 'PLACE' ? '/dashboard/places' : '/dashboard/routes';
}

function formatMode(mode: SharedRouteSnapshot['route']['revision']['mode']) {
  return mode === 'PING_PONG' ? 'PingPong' : mode[0] + mode.slice(1).toLowerCase();
}

function formatCoord(value: number) {
  return value.toFixed(6);
}

function formatError(error: unknown): string {
  if (error instanceof ApiError || error instanceof Error) {
    return error.message;
  }

  return 'Unexpected error';
}
