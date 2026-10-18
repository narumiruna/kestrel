'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { LanguageSelector } from '@/components/LanguageSelector';
import { Button } from '@/components/ui/radix-ui';
import { errorMessage } from '@/i18n/errors';
import { formatSpeed } from '@/i18n/format';
import {
  apiFetch,
  type Place,
  type Route,
  type SharedRouteSnapshot,
  type SharedSnapshot,
} from '@/lib/api';

const PlaceMapPreview = dynamic(() => import('@/components/PlaceMapPreview'), { ssr: false });
const RouteMapPreview = dynamic(() => import('@/components/RouteMapPreview'), { ssr: false });

export default function SharedItemPage() {
  const t = useTranslations('SharedItem');
  const te = useTranslations('Errors');
  const auth = useAuth();
  const router = useRouter();
  const params = useParams<{ token: string }>();
  const token = typeof params.token === 'string' ? params.token : '';
  const [sharedItem, setSharedItem] = useState<SharedSnapshot | null>(null);
  const [copiedItem, setCopiedItem] = useState<Place | Route | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [copyError, setCopyError] = useState<unknown>(null);
  const [isCopying, setIsCopying] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (token.length === 0) {
      setError(new Error());
      setIsLoading(false);
      return;
    }
    setError(null);
    setIsLoading(true);
    void apiFetch<SharedSnapshot>(`/shares/${token}`)
      .then(setSharedItem)
      .catch(setError)
      .finally(() => setIsLoading(false));
  }, [token]);

  async function copyToLibrary() {
    if (!auth.isAuthenticated) {
      router.push('/login');
      return;
    }
    if (sharedItem == null) {
      setCopyError(new Error());
      return;
    }
    setCopyError(null);
    setIsCopying(true);
    try {
      const result = await auth.apiRequest<Place | Route>(`/shares/${token}/copy`, {
        body: JSON.stringify(
          sharedItem.kind === 'PLACE' ? {} : { routeRevisionId: sharedItem.route.revision.id },
        ),
        method: 'POST',
      });
      setCopiedItem(result);
    } catch (nextError) {
      setCopyError(nextError);
    } finally {
      setIsCopying(false);
    }
  }

  const kind = sharedItem?.kind === 'PLACE' ? 'place' : 'route';
  const dashboardHref = kind === 'place' ? '/dashboard/places' : '/dashboard/routes';
  return (
    <main className="shell stack public-share-shell">
      <header className="topbar public-share-header">
        <div className="brand">
          <strong>{t('title')}</strong>
          <span className="muted">{t('publicLink', { kind })}</span>
        </div>
        <div className="row">
          <LanguageSelector />
          <Link href={auth.isAuthenticated ? dashboardHref : '/login'}>
            {auth.isAuthenticated ? t('back', { kind }) : t('signIn')}
          </Link>
        </div>
      </header>
      {isLoading ? <p className="muted">{t('loading')}</p> : null}
      {error == null ? null : (
        <div className="error" role="alert">
          {token ? errorMessage(error, te) : t('invalidLink')}
        </div>
      )}
      {sharedItem == null || isLoading ? null : (
        <section className="grid public-share-grid">
          {sharedItem.kind === 'PLACE' ? (
            <SharedPlaceCard sharedItem={sharedItem} />
          ) : (
            <SharedRouteCard sharedItem={sharedItem} />
          )}
          <article className="panel stack public-share-card">
            <h2>{t('copyHeading')}</h2>
            <p className="muted no-margin">{t('copyHelp', { kind })}</p>
            {copyError == null ? null : (
              <div className="error" role="alert">
                {sharedItem == null ? t('notLoaded') : errorMessage(copyError, te)}
              </div>
            )}
            {copiedItem == null ? null : (
              <div className="success">
                {t('copied', { name: copiedItem.name })}{' '}
                <Link href={dashboardHref}>{t('open')}</Link>
              </div>
            )}
            <div className="row">
              <Button disabled={isCopying} type="button" onClick={() => void copyToLibrary()}>
                {isCopying ? t('copying') : auth.isAuthenticated ? t('copy') : t('signInToCopy')}
              </Button>
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
  const t = useTranslations('SharedItem');
  return (
    <article className="panel stack public-share-card">
      <div className="row public-share-title-row">
        <div>
          <h1>{sharedItem.place.name}</h1>
          <p className="muted no-margin">
            {sharedItem.place.latitude.toFixed(6)}, {sharedItem.place.longitude.toFixed(6)}
          </p>
        </div>
        <span className="chip">{t('publicKind', { kind: 'place' })}</span>
      </div>
      {sharedItem.place.description == null ? null : <p>{sharedItem.place.description}</p>}
      <PlaceMapPreview
        latitude={sharedItem.place.latitude}
        longitude={sharedItem.place.longitude}
      />
      <div className="chip-row">
        {sharedItem.place.tags.length === 0 ? (
          <span className="chip">{t('place')}</span>
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
  const t = useTranslations('SharedItem');
  const locale = useLocale();
  const revision = sharedItem.route.revision;
  return (
    <article className="panel stack public-share-card">
      <div className="row public-share-title-row">
        <div>
          <h1>{sharedItem.route.name}</h1>
          <p className="muted no-margin">
            {t('revision', { count: revision.revisionNumber })} ·{' '}
            {formatSpeed(revision.defaultSpeedKmh, locale)} · {t('mode', { mode: revision.mode })}
          </p>
        </div>
        <span className="chip">{t('publicKind', { kind: 'route' })}</span>
      </div>
      {sharedItem.route.description == null ? null : <p>{sharedItem.route.description}</p>}
      <RouteMapPreview waypoints={revision.waypoints} />
      <div className="chip-row">
        <span className="chip">{t('waypoints', { count: revision.waypoints.length })}</span>
        <span className="chip">{t('mode', { mode: revision.mode })}</span>
        <span className="chip">{formatSpeed(revision.defaultSpeedKmh, locale)}</span>
      </div>
    </article>
  );
}
