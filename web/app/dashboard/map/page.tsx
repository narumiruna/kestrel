'use client';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { type RefObject, useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardCheatsheet } from '@/components/cartographer/KeyboardCheatsheet';
import { ScaleBar } from '@/components/cartographer/ScaleBar';
import { Stage } from '@/components/cartographer/Stage';
import { StatusStrip } from '@/components/cartographer/StatusStrip';
import { UserMark } from '@/components/cartographer/UserMark';
import { useKeyboardShortcuts } from '@/components/cartographer/useKeyboardShortcuts';
import { useDashboardLibraryData } from '@/components/dashboard/useDashboardLibraryData';
import {
  formatCoord,
  formatMode,
  formatRouteDistanceFromWaypoints,
} from '@/components/dashboard/utils';
import type { Place, Route } from '@/lib/api';

const CartographerPlaceMap = dynamic(
  () => import('@/components/cartographer/CartographerPlaceMap'),
  { ssr: false },
);
const RouteMapPreview = dynamic(() => import('@/components/RouteMapPreview'), { ssr: false });
const ZoomStack = dynamic(
  () => import('@/components/cartographer/ZoomStack').then((module) => module.ZoomStack),
  { ssr: false },
);

type MapKind = 'places' | 'routes';
type ViewportControls = {
  fit: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
};

export default function DashboardMapPage() {
  const {
    auth,
    error,
    isLoading,
    lastLoadedAt,
    places,
    refresh,
    routes,
    selectedPlaceId,
    selectedRouteId,
    setSelectedPlaceId,
    setSelectedRouteId,
  } = useDashboardLibraryData();
  const router = useRouter();
  const searchRef = useRef<HTMLInputElement | null>(null);
  const [activeKind, setActiveKind] = useState<MapKind>('routes');
  const [query, setQuery] = useState('');
  const [viewportControls, setViewportControls] = useState<ViewportControls | null>(null);
  const [isLibraryCollapsed, setIsLibraryCollapsed] = useState(false);
  const [isPreviewCollapsed, setIsPreviewCollapsed] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);

  const selectedPlace = useMemo(
    () => places.find((place) => place.id === selectedPlaceId) ?? null,
    [places, selectedPlaceId],
  );
  const selectedRoute = useMemo(
    () => routes.find((route) => route.id === selectedRouteId) ?? null,
    [routes, selectedRouteId],
  );
  const filteredPlaces = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return normalizedQuery.length === 0
      ? places
      : places.filter((place) =>
          [place.name, place.description ?? '', ...place.tags]
            .join(' ')
            .toLowerCase()
            .includes(normalizedQuery),
        );
  }, [places, query]);
  const filteredRoutes = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return normalizedQuery.length === 0
      ? routes
      : routes.filter((route) =>
          [route.name, route.description ?? '', formatMode(route.mode)]
            .join(' ')
            .toLowerCase()
            .includes(normalizedQuery),
        );
  }, [query, routes]);
  const lastUpdatedLabel = useRelativeUpdatedLabel(lastLoadedAt);

  useKeyboardShortcuts({
    onClose: () => setIsHelpOpen(false),
    onFocusSearch: () => searchRef.current?.focus(),
    onGoLibrary: () => router.push('/dashboard/library'),
    onGoMap: () => router.push('/dashboard/map'),
    onGoPlaces: () => router.push('/dashboard/library/places'),
    onGoRoutes: () => router.push('/dashboard/library/routes'),
    onToggleHelp: () => setIsHelpOpen((current) => !current),
  });

  if (!auth.isHydrated || !auth.isAuthenticated || auth.session == null) {
    return (
      <main className="shell">
        <p className="muted">Loading session…</p>
      </main>
    );
  }

  async function changePassword(input: { currentPassword: string; newPassword: string }) {
    await auth.apiRequest('/auth/password/change', {
      body: JSON.stringify(input),
      method: 'POST',
    });
  }

  const routeWaypoints =
    selectedRoute?.currentRevision?.waypoints.map((waypoint) => ({
      latitude: waypoint.latitude,
      longitude: waypoint.longitude,
    })) ?? [];
  const map =
    activeKind === 'places' ? (
      <CartographerPlaceMap
        draftCoords={null}
        places={places}
        selectedPlaceId={selectedPlaceId}
        onReady={setViewportControls}
        onSelectPlace={(placeId) => {
          setActiveKind('places');
          setSelectedPlaceId(placeId);
        }}
      />
    ) : (
      <RouteMapPreview
        className="cartographer-map"
        interactive
        waypoints={routeWaypoints}
        onReady={setViewportControls}
      />
    );
  const libraryPath =
    activeKind === 'places' ? '/dashboard/library/places' : '/dashboard/library/routes';
  const selectedItemId = activeKind === 'places' ? selectedPlaceId : selectedRouteId;
  const title =
    activeKind === 'places'
      ? (selectedPlace?.name ?? 'Places map')
      : (selectedRoute?.name ?? 'Routes map');
  const subtitle =
    activeKind === 'places'
      ? selectedPlace == null
        ? 'Pick a place to frame it on the map.'
        : `${formatCoord(selectedPlace.latitude)}, ${formatCoord(selectedPlace.longitude)}`
      : selectedRoute == null
        ? 'Pick a route to frame its latest revision.'
        : `${formatRouteDistanceFromWaypoints(routeWaypoints)} · ${selectedRoute.defaultSpeedKmh} km/h · ${formatMode(selectedRoute.mode)}`;

  return (
    <Stage
      isLeftPanelCollapsed={isLibraryCollapsed}
      isRightPanelCollapsed={isPreviewCollapsed}
      map={map}
      mode={activeKind}
      onToggleLeftPanel={() => setIsLibraryCollapsed((current) => !current)}
      onToggleMapFocus={() => {
        const shouldRestorePanels = isLibraryCollapsed && isPreviewCollapsed;
        setIsLibraryCollapsed(!shouldRestorePanels);
        setIsPreviewCollapsed(!shouldRestorePanels);
      }}
      onToggleRightPanel={() => setIsPreviewCollapsed((current) => !current)}
      workspace="map"
    >
      <StatusStrip
        error={error}
        isRefreshing={isLoading}
        lastUpdatedLabel={lastUpdatedLabel}
        onRefresh={() => void refresh()}
      />
      <UserMark
        username={auth.session.user.username}
        onChangePassword={changePassword}
        onLogout={auth.logout}
      />
      <MapLibraryPanel
        activeKind={activeKind}
        filteredPlaces={filteredPlaces}
        filteredRoutes={filteredRoutes}
        isLoading={isLoading}
        query={query}
        searchRef={searchRef}
        selectedPlaceId={selectedPlaceId}
        selectedRouteId={selectedRouteId}
        onQueryChange={setQuery}
        onSelectKind={setActiveKind}
        onSelectPlace={(placeId) => {
          setActiveKind('places');
          setSelectedPlaceId(placeId);
        }}
        onSelectRoute={(routeId) => {
          setActiveKind('routes');
          setSelectedRouteId(routeId);
        }}
      />
      <section className="index-card" aria-label="Map selection preview">
        <span aria-hidden className="index-card-pin" />
        <div className="index-card-breadcrumb breadcrumb">
          Map / <span>{activeKind === 'places' ? 'Places' : 'Routes'}</span>
        </div>
        <header className="index-card-header">
          <div>
            <p className="index-card-stamp font-mono">Map view</p>
            <h2 className="font-serif">{title}</h2>
            <p>{subtitle}</p>
          </div>
          <div className="index-card-actions">
            <button
              className="secondary"
              type="button"
              onClick={() =>
                router.push(
                  selectedItemId == null
                    ? libraryPath
                    : `${libraryPath}?selected=${encodeURIComponent(selectedItemId)}`,
                )
              }
            >
              {activeKind === 'places'
                ? selectedPlace == null
                  ? 'Browse places'
                  : 'Edit place'
                : selectedRoute == null
                  ? 'Browse routes'
                  : 'Edit route'}
            </button>
          </div>
        </header>
        <div className="index-card-body stack">
          <p className="muted no-margin">
            Use Map for spatial review and quick device-ready context. Use Library for editing,
            sharing, and cleanup.
          </p>
        </div>
      </section>
      <ZoomStack
        onFit={() => viewportControls?.fit()}
        onZoomIn={() => viewportControls?.zoomIn()}
        onZoomOut={() => viewportControls?.zoomOut()}
      />
      <ScaleBar />
      <KeyboardCheatsheet isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
    </Stage>
  );
}

function MapLibraryPanel({
  activeKind,
  filteredPlaces,
  filteredRoutes,
  isLoading,
  onQueryChange,
  onSelectKind,
  onSelectPlace,
  onSelectRoute,
  query,
  searchRef,
  selectedPlaceId,
  selectedRouteId,
}: {
  activeKind: MapKind;
  filteredPlaces: Place[];
  filteredRoutes: Route[];
  isLoading: boolean;
  onQueryChange: (query: string) => void;
  onSelectKind: (kind: MapKind) => void;
  onSelectPlace: (placeId: string) => void;
  onSelectRoute: (routeId: string) => void;
  query: string;
  searchRef: RefObject<HTMLInputElement | null>;
  selectedPlaceId: string | null;
  selectedRouteId: string | null;
}) {
  const activeItems = activeKind === 'places' ? filteredPlaces : filteredRoutes;

  return (
    <aside className="field-notebook map-library-panel" aria-label="Map library">
      <div aria-hidden className="field-notebook-spine" />
      <nav aria-label="Map item type" className="sidebar-tabs">
        <button
          className={activeKind === 'places' ? 'active' : ''}
          type="button"
          onClick={() => onSelectKind('places')}
        >
          <span>Places</span>
        </button>
        <button
          className={activeKind === 'routes' ? 'active' : ''}
          type="button"
          onClick={() => onSelectKind('routes')}
        >
          <span>Routes</span>
        </button>
      </nav>
      <label className="sidebar-search font-mono">
        <span className="sr-only">Search map items</span>
        <input
          ref={searchRef}
          placeholder={`Search ${activeKind}...`}
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
        />
      </label>
      <div className="notebook-list">
        {isLoading ? <NotebookSkeleton /> : null}
        {activeKind === 'places'
          ? filteredPlaces.map((place) => (
              <button
                className={`notebook-entry${selectedPlaceId === place.id ? ' active' : ''}`}
                key={place.id}
                type="button"
                onClick={() => onSelectPlace(place.id)}
              >
                <strong>{place.name}</strong>
                <span className="font-mono">
                  {formatCoord(place.latitude)}, {formatCoord(place.longitude)}
                </span>
              </button>
            ))
          : filteredRoutes.map((route) => (
              <button
                className={`notebook-entry route-notebook-entry${selectedRouteId === route.id ? ' active' : ''}`}
                key={route.id}
                type="button"
                onClick={() => onSelectRoute(route.id)}
              >
                <strong className="route-card-title">{route.name}</strong>
                <span className="route-card-meta-line">
                  {formatRouteDistanceFromWaypoints(route.currentRevision?.waypoints ?? [])} ·{' '}
                  {formatMode(route.mode)}
                </span>
              </button>
            ))}
        {activeItems.length === 0 && !isLoading ? (
          <div className="notebook-empty">
            <p className="muted no-margin">No {activeKind} match this search.</p>
          </div>
        ) : null}
      </div>
    </aside>
  );
}

function NotebookSkeleton() {
  return (
    <div aria-label="Loading map items" className="skeleton-list" role="status">
      <span className="skeleton-line wide" />
      <span className="skeleton-line" />
      <span className="skeleton-line short" />
    </div>
  );
}

function useRelativeUpdatedLabel(lastUpdatedAt: Date | null): string | null {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (lastUpdatedAt == null) {
      return;
    }

    setNow(Date.now());
    const intervalId = window.setInterval(() => setNow(Date.now()), 30_000);

    return () => window.clearInterval(intervalId);
  }, [lastUpdatedAt]);

  if (lastUpdatedAt == null) {
    return null;
  }

  const elapsedSeconds = Math.max(0, Math.floor((now - lastUpdatedAt.getTime()) / 1000));

  if (elapsedSeconds < 10) {
    return 'just now';
  }

  if (elapsedSeconds < 60) {
    return `${elapsedSeconds}s ago`;
  }

  const elapsedMinutes = Math.floor(elapsedSeconds / 60);

  if (elapsedMinutes < 60) {
    return `${elapsedMinutes}m ago`;
  }

  return lastUpdatedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
