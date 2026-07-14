'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import DashboardShell from '@/components/dashboard/DashboardShell';
import { LibraryItemActions } from '@/components/dashboard/LibraryItemActions';
import { useDashboardLibraryData } from '@/components/dashboard/useDashboardLibraryData';
import {
  formatCoord,
  formatMode,
  formatRouteDistanceFromWaypoints,
} from '@/components/dashboard/utils';
import type { Place, Route } from '@/lib/api';

export type LibraryFilter = 'all' | 'places' | 'routes';

export default function LibraryCatalog({
  initialFilter = 'all',
}: {
  initialFilter?: LibraryFilter;
}) {
  const { auth, error, isLoading, lastLoadedAt, places, refresh, routes } =
    useDashboardLibraryData();
  const [filter, setFilter] = useState<LibraryFilter>(initialFilter);
  const [query, setQuery] = useState('');
  const normalizedQuery = query.trim().toLowerCase();
  const filteredPlaces = useMemo(
    () =>
      places.filter((place) =>
        [place.name, place.description ?? '', ...place.tags]
          .join(' ')
          .toLowerCase()
          .includes(normalizedQuery),
      ),
    [normalizedQuery, places],
  );
  const filteredRoutes = useMemo(
    () =>
      routes.filter((route) =>
        [route.name, route.description ?? '', formatMode(route.mode)]
          .join(' ')
          .toLowerCase()
          .includes(normalizedQuery),
      ),
    [normalizedQuery, routes],
  );

  if (!auth.isHydrated || !auth.isAuthenticated || auth.session == null) {
    return (
      <main className="library-page-shell">
        <p className="muted">Loading library…</p>
      </main>
    );
  }

  const showPlaces = filter !== 'routes';
  const showRoutes = filter !== 'places';
  const totalVisible =
    (showPlaces ? filteredPlaces.length : 0) + (showRoutes ? filteredRoutes.length : 0);

  return (
    <DashboardShell
      activeSection="library"
      isRefreshing={isLoading}
      lastUpdatedAt={lastLoadedAt}
      username={auth.session.user.username}
      onLogout={auth.logout}
      onRefresh={() => void refresh()}
    >
      <section className="library-catalog" aria-labelledby="library-heading">
        <header className="library-catalog-header">
          <div>
            <p className="library-eyebrow">Cloud library</p>
            <h1 id="library-heading">Places and routes</h1>
            <p>
              Find and organize saved items here. Open an item on Map when you want to change it.
            </p>
          </div>
          <details className="library-new-menu">
            <summary>New item</summary>
            <div className="library-new-menu-content">
              <Link href="/dashboard/map?kind=places&new=1">New place</Link>
              <Link href="/dashboard/map?kind=routes&new=1">New route</Link>
            </div>
          </details>
        </header>

        <div className="library-toolbar">
          <nav aria-label="Library item type" className="library-filter-tabs">
            <button
              aria-pressed={filter === 'all'}
              className={filter === 'all' ? 'active' : ''}
              type="button"
              onClick={() => setFilter('all')}
            >
              All <span>{places.length + routes.length}</span>
            </button>
            <button
              aria-pressed={filter === 'places'}
              className={filter === 'places' ? 'active' : ''}
              type="button"
              onClick={() => setFilter('places')}
            >
              Places <span>{places.length}</span>
            </button>
            <button
              aria-pressed={filter === 'routes'}
              className={filter === 'routes' ? 'active' : ''}
              type="button"
              onClick={() => setFilter('routes')}
            >
              Routes <span>{routes.length}</span>
            </button>
          </nav>
          <label className="library-search">
            <span className="library-search-label">Search library</span>
            <input
              placeholder="Search names, notes, tags, or modes…"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
        </div>

        {error == null ? null : (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        {isLoading && places.length === 0 && routes.length === 0 ? <LibrarySkeleton /> : null}
        {!isLoading && totalVisible === 0 ? (
          <div className="library-empty-state">
            <h2 className="library-empty-title">
              {normalizedQuery.length === 0 ? 'Your library is empty' : 'No matching items'}
            </h2>
            <p className="muted library-empty-copy">
              {normalizedQuery.length === 0
                ? 'Create a place or route to start planning on the map.'
                : 'Try a different search or item type.'}
            </p>
            {normalizedQuery.length === 0 ? (
              <div className="library-empty-actions">
                <Link href="/dashboard/map?kind=places&new=1">Create place</Link>
                <Link href="/dashboard/map?kind=routes&new=1">Create route</Link>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="library-sections">
          {showPlaces && filteredPlaces.length > 0 ? (
            <LibrarySection count={filteredPlaces.length} title="Places">
              {filteredPlaces.map((place) => (
                <PlaceLibraryRow key={place.id} place={place} onDeleted={refresh} />
              ))}
            </LibrarySection>
          ) : null}
          {showRoutes && filteredRoutes.length > 0 ? (
            <LibrarySection count={filteredRoutes.length} title="Routes">
              {filteredRoutes.map((route) => (
                <RouteLibraryRow key={route.id} route={route} onDeleted={refresh} />
              ))}
            </LibrarySection>
          ) : null}
        </div>
      </section>
    </DashboardShell>
  );
}

function LibrarySection({
  children,
  count,
  title,
}: {
  children: React.ReactNode;
  count: number;
  title: string;
}) {
  return (
    <section className="library-section" aria-labelledby={`library-${title.toLowerCase()}`}>
      <header>
        <h2 className="library-section-title" id={`library-${title.toLowerCase()}`}>
          {title}
        </h2>
        <span>{count}</span>
      </header>
      <div className="library-item-list">{children}</div>
    </section>
  );
}

function PlaceLibraryRow({ place, onDeleted }: { place: Place; onDeleted: () => Promise<void> }) {
  return (
    <article className="library-item-row">
      <div className="library-item-type" aria-hidden="true">
        P
      </div>
      <div className="library-item-main">
        <h3>{place.name}</h3>
        <p className="library-item-meta">
          {formatCoord(place.latitude)}, {formatCoord(place.longitude)}
        </p>
        {place.description == null ? null : <p>{place.description}</p>}
        {place.tags.length === 0 ? null : (
          <div className="chip-row">
            {place.tags.map((tag) => (
              <span className="chip" key={tag}>
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
      <LibraryItemActions
        itemId={place.id}
        itemKind="places"
        itemName={place.name}
        onDeleted={onDeleted}
      />
    </article>
  );
}

function RouteLibraryRow({ route, onDeleted }: { route: Route; onDeleted: () => Promise<void> }) {
  const waypointCount = route.currentRevision?.waypoints.length ?? 0;

  return (
    <article className="library-item-row">
      <div className="library-item-type" aria-hidden="true">
        R
      </div>
      <div className="library-item-main">
        <div className="library-item-title-row">
          <h3>{route.name}</h3>
          {route.isPublic ? <span className="chip">public</span> : null}
        </div>
        <p className="library-item-meta">
          {formatRouteDistanceFromWaypoints(route.currentRevision?.waypoints ?? [])} ·{' '}
          {waypointCount} waypoint{waypointCount === 1 ? '' : 's'} · {route.defaultSpeedKmh} km/h ·{' '}
          {formatMode(route.mode)}
        </p>
        {route.description == null ? null : <p>{route.description}</p>}
      </div>
      <LibraryItemActions
        itemId={route.id}
        itemKind="routes"
        itemName={route.name}
        onDeleted={onDeleted}
      />
    </article>
  );
}

function LibrarySkeleton() {
  return (
    <div aria-label="Loading library items" className="library-skeleton" role="status">
      <span className="library-skeleton-line" />
      <span className="library-skeleton-line" />
      <span className="library-skeleton-line" />
    </div>
  );
}
