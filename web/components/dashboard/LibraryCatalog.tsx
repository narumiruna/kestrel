'use client';

import {
  ArrowRightIcon,
  ChevronDownIcon,
  Cross2Icon,
  MagnifyingGlassIcon,
  PlusIcon,
  SewingPinIcon,
  Share1Icon,
} from '@radix-ui/react-icons';
import { IconButton, TextField } from '@radix-ui/themes';
import Link from 'next/link';
import { useMemo, useRef, useState } from 'react';
import DashboardShell from '@/components/dashboard/DashboardShell';
import { LibraryItemActions } from '@/components/dashboard/LibraryItemActions';
import { useDashboardLibraryData } from '@/components/dashboard/useDashboardLibraryData';
import {
  formatCoord,
  formatMode,
  formatRouteDistanceFromWaypoints,
} from '@/components/dashboard/utils';
import {
  Button,
  Menu,
  MenuSurface,
  TextInput,
  Toggle,
  ToggleGroup,
} from '@/components/ui/radix-ui';
import type { Place, Route } from '@/lib/api';

export type LibraryFilter = 'all' | 'places' | 'routes';

export default function LibraryCatalog({
  initialFilter = 'all',
}: {
  initialFilter?: LibraryFilter;
}) {
  const {
    auth,
    error,
    isLoading,
    lastLoadedAt,
    places,
    placesError,
    refresh,
    routes,
    routesError,
  } = useDashboardLibraryData();
  const [filter, setFilter] = useState<LibraryFilter>(initialFilter);
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement | null>(null);
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

  function clearSearch() {
    setQuery('');
    searchRef.current?.focus();
  }

  if (!auth.isHydrated || !auth.isAuthenticated || auth.session == null) {
    return (
      <main className="library-page-shell">
        <p className="muted" role="status">
          Loading library…
        </p>
      </main>
    );
  }

  const showPlaces = filter !== 'routes';
  const showRoutes = filter !== 'places';
  const totalItems = places.length + routes.length;
  const didLibraryLoadFail = placesError != null && routesError != null;
  const totalVisible =
    (showPlaces ? filteredPlaces.length : 0) + (showRoutes ? filteredRoutes.length : 0);
  const activeError = (showPlaces && placesError != null) || (showRoutes && routesError != null);
  const resultLabel = filter === 'all' ? 'item' : filter === 'places' ? 'place' : 'route';
  const resultSummary = isLoading
    ? totalItems === 0
      ? 'Loading library…'
      : 'Updating library…'
    : `${totalVisible} ${error == null ? '' : 'available '}${resultLabel}${totalVisible === 1 ? '' : 's'}${normalizedQuery.length > 0 ? ' found' : ''}`;

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
            <p className="library-eyebrow">Places & routes</p>
            <h1 id="library-heading">Your library</h1>
            <p>Your saved starting points and paths. Select an item to edit it on the map.</p>
          </div>
          <MenuSurface
            className="library-new-menu-content"
            trigger={
              <Button className="library-new-menu-trigger" type="button">
                <PlusIcon aria-hidden /> New item <ChevronDownIcon aria-hidden />
              </Button>
            }
          >
            <Menu.LinkItem
              className="ui-menu-link-item"
              render={<Link href="/dashboard/map?kind=places&new=1" />}
            >
              <SewingPinIcon aria-hidden /> New place
            </Menu.LinkItem>
            <Menu.LinkItem
              className="ui-menu-link-item"
              render={<Link href="/dashboard/map?kind=routes&new=1" />}
            >
              <Share1Icon aria-hidden /> New route
            </Menu.LinkItem>
          </MenuSurface>
        </header>

        <div className="library-toolbar">
          <label htmlFor="library-search" className="library-search">
            <span className="sr-only">Search library</span>
            <TextInput
              id="library-search"
              ref={searchRef}
              placeholder="Search names, notes, tags, or modes…"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            >
              <TextField.Slot>
                <MagnifyingGlassIcon aria-hidden />
              </TextField.Slot>
              {query.length === 0 ? null : (
                <TextField.Slot side="right">
                  <IconButton
                    aria-label="Clear search"
                    type="button"
                    variant="ghost"
                    onClick={clearSearch}
                  >
                    <Cross2Icon aria-hidden />
                  </IconButton>
                </TextField.Slot>
              )}
            </TextInput>
          </label>
          <ToggleGroup
            aria-label="Library item type"
            className="library-filter-tabs"
            value={[filter]}
            onValueChange={(values) => {
              const nextFilter = values.at(-1) as LibraryFilter | undefined;
              if (nextFilter != null) {
                setFilter(nextFilter);
              }
            }}
          >
            <Toggle value="all">
              All <span>{isLoading || error != null ? '—' : totalItems}</span>
            </Toggle>
            <Toggle value="places">
              Places <span>{isLoading || placesError != null ? '—' : places.length}</span>
            </Toggle>
            <Toggle value="routes">
              Routes <span>{isLoading || routesError != null ? '—' : routes.length}</span>
            </Toggle>
          </ToggleGroup>
        </div>

        <p className="library-results-summary" role="status" aria-atomic="true">
          {resultSummary}
        </p>
        {error == null ? null : (
          <div className="library-load-error" role="alert">
            <div>
              <strong>
                {didLibraryLoadFail
                  ? 'Couldn’t load your library'
                  : 'Some items couldn’t be updated'}
              </strong>
              <p>
                {error}
                {totalItems === 0 ? '' : ' Available items are still shown.'}
              </p>
            </div>
            <Button
              className="secondary"
              disabled={isLoading}
              type="button"
              onClick={() => void refresh()}
            >
              Try again
            </Button>
          </div>
        )}
        {isLoading && totalItems === 0 ? <LibrarySkeleton /> : null}
        {!isLoading && !activeError && totalVisible === 0 ? (
          <LibraryEmptyState
            filter={filter}
            isSearching={normalizedQuery.length > 0}
            onClearSearch={clearSearch}
          />
        ) : null}

        <div className="library-sections" aria-busy={isLoading}>
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

function LibraryEmptyState({
  filter,
  isSearching,
  onClearSearch,
}: {
  filter: LibraryFilter;
  isSearching: boolean;
  onClearSearch: () => void;
}) {
  return (
    <div className="library-empty-state">
      <div className="library-empty-icon" aria-hidden>
        {isSearching ? (
          <MagnifyingGlassIcon />
        ) : filter === 'routes' ? (
          <Share1Icon />
        ) : (
          <SewingPinIcon />
        )}
      </div>
      <h2 className="library-empty-title">
        {isSearching
          ? `No matching ${filter === 'all' ? 'items' : filter}`
          : filter === 'all'
            ? 'No saved items yet'
            : `No ${filter} yet`}
      </h2>
      <p className="muted library-empty-copy">
        {isSearching
          ? 'Try another name, note, tag, or mode, or clear your search to see saved items.'
          : filter === 'places'
            ? 'Save a location on the map to find it here whenever you need it.'
            : filter === 'routes'
              ? 'Connect points on the map and save a route to find it here.'
              : 'Save a place for a single location, or build a route with multiple stops.'}
      </p>
      <div className="library-empty-actions">
        {isSearching ? (
          <Button className="secondary" type="button" onClick={onClearSearch}>
            Clear search
          </Button>
        ) : (
          <>
            {filter === 'routes' ? null : (
              <Button asChild>
                <Link href="/dashboard/map?kind=places&new=1">Create place</Link>
              </Button>
            )}
            {filter === 'places' ? null : (
              <Button asChild variant={filter === 'routes' ? 'solid' : 'soft'}>
                <Link href="/dashboard/map?kind=routes&new=1">Create route</Link>
              </Button>
            )}
          </>
        )}
      </div>
    </div>
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
        <SewingPinIcon />
      </div>
      <Link
        className="library-item-main"
        href={`/dashboard/map?kind=places&selected=${encodeURIComponent(place.id)}`}
        aria-label={`Open ${place.name} on map`}
      >
        <div className="library-item-title-row">
          <h3>{place.name}</h3>
          <ArrowRightIcon className="library-item-arrow" aria-hidden />
        </div>
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
      </Link>
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
      <div className="library-item-type library-item-type-route" aria-hidden="true">
        <Share1Icon />
      </div>
      <Link
        className="library-item-main"
        href={`/dashboard/map?kind=routes&selected=${encodeURIComponent(route.id)}`}
        aria-label={`Open ${route.name} on map`}
      >
        <div className="library-item-title-row">
          <h3>{route.name}</h3>
          {route.isPublic ? <span className="chip">Public</span> : null}
          <ArrowRightIcon className="library-item-arrow" aria-hidden />
        </div>
        <p className="library-item-meta">
          {formatRouteDistanceFromWaypoints(route.currentRevision?.waypoints ?? [])} ·{' '}
          {waypointCount} waypoint{waypointCount === 1 ? '' : 's'} · {route.defaultSpeedKmh} km/h ·{' '}
          {formatMode(route.mode)}
        </p>
        {route.description == null ? null : <p>{route.description}</p>}
      </Link>
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
