'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type RefObject, useEffect, useMemo, useRef, useState } from 'react';
import { IndexCard } from '@/components/cartographer/IndexCard';
import { KeyboardCheatsheet } from '@/components/cartographer/KeyboardCheatsheet';
import { ScaleBar } from '@/components/cartographer/ScaleBar';
import { type MobileWorkspacePanel, Stage } from '@/components/cartographer/Stage';
import { StatusStrip } from '@/components/cartographer/StatusStrip';
import { UserMark } from '@/components/cartographer/UserMark';
import { useKeyboardShortcuts } from '@/components/cartographer/useKeyboardShortcuts';
import PlaceEditor from '@/components/dashboard/PlaceEditor';
import { PlaceRemoteControlAction } from '@/components/dashboard/RemoteControlPanel';
import RouteEditor from '@/components/dashboard/RouteEditor';
import { useDashboardLibraryData } from '@/components/dashboard/useDashboardLibraryData';
import {
  formatCoord,
  formatMode,
  formatRouteDistanceFromWaypoints,
} from '@/components/dashboard/utils';
import { DEFAULT_MAP_CENTER } from '@/components/mapStyle';
import type { Place, PlaceInput, Route, RouteInput, RouteWaypoint } from '@/lib/api';

const CartographerPlaceMap = dynamic(
  () => import('@/components/cartographer/CartographerPlaceMap'),
  { ssr: false },
);
const RouteMapEditor = dynamic(() => import('@/components/RouteMapEditor'), { ssr: false });
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

type Coordinates = { latitude: number; longitude: number };

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
  const hasAppliedInitialRequestRef = useRef(false);
  const initialCreationKindRef = useRef<MapKind | null>(null);
  const [activeKind, setActiveKind] = useState<MapKind>('routes');
  const [query, setQuery] = useState('');
  const [viewportControls, setViewportControls] = useState<ViewportControls | null>(null);
  const [isLibraryCollapsed, setIsLibraryCollapsed] = useState(false);
  const [isInspectorCollapsed, setIsInspectorCollapsed] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<MobileWorkspacePanel>('map');
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [draftWaypoints, setDraftWaypoints] = useState<RouteWaypoint[]>([]);
  const [selectedWaypointIndex, setSelectedWaypointIndex] = useState<number | null>(null);
  const [hoveredWaypointIndex, setHoveredWaypointIndex] = useState<number | null>(null);
  const [focusTarget, setFocusTarget] = useState<RouteWaypoint | null>(null);
  const [fitRequest, setFitRequest] = useState(0);
  const [isRouteDirty, setIsRouteDirty] = useState(false);
  const [isNewRoute, setIsNewRoute] = useState(false);
  const [routeDraftNonce, setRouteDraftNonce] = useState(0);
  const [draftPlaceCoords, setDraftPlaceCoords] = useState<Coordinates | null>(null);
  const [isPlaceDirty, setIsPlaceDirty] = useState(false);
  const [isNewPlace, setIsNewPlace] = useState(false);
  const [placeDraftNonce, setPlaceDraftNonce] = useState(0);

  const selectedPlace = useMemo(
    () => places.find((place) => place.id === selectedPlaceId) ?? null,
    [places, selectedPlaceId],
  );
  const selectedRoute = useMemo(
    () => routes.find((route) => route.id === selectedRouteId) ?? null,
    [routes, selectedRouteId],
  );
  const activePlaceCoords =
    draftPlaceCoords ??
    (selectedPlace == null
      ? DEFAULT_MAP_CENTER
      : { latitude: selectedPlace.latitude, longitude: selectedPlace.longitude });
  const filteredPlaces = useMemo(() => filterPlaces(places, query), [places, query]);
  const filteredRoutes = useMemo(() => filterRoutes(routes, query), [query, routes]);
  const lastUpdatedLabel = useRelativeUpdatedLabel(lastLoadedAt);
  const hasDirtyDraft = isRouteDirty || isPlaceDirty;

  useEffect(() => {
    if (isLoading || hasAppliedInitialRequestRef.current) {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const requestedKind = params.get('kind') === 'places' ? 'places' : 'routes';
    const requestedId = params.get('selected');
    const isNew = params.get('new') === '1';

    hasAppliedInitialRequestRef.current = true;
    setActiveKind(requestedKind);

    if (requestedKind === 'places') {
      if (isNew) {
        initialCreationKindRef.current = 'places';
        setSelectedPlaceId(null);
        setDraftPlaceCoords(DEFAULT_MAP_CENTER);
        setIsNewPlace(true);
        setPlaceDraftNonce((current) => current + 1);
        setMobilePanel('inspector');
      } else if (places.some((place) => place.id === requestedId)) {
        setSelectedPlaceId(requestedId);
      }
    } else if (isNew) {
      initialCreationKindRef.current = 'routes';
      setSelectedRouteId(null);
      setDraftWaypoints([]);
      setIsNewRoute(true);
      setRouteDraftNonce((current) => current + 1);
      setMobilePanel('inspector');
    } else if (routes.some((route) => route.id === requestedId)) {
      setSelectedRouteId(requestedId);
    }
  }, [isLoading, places, routes, setSelectedPlaceId, setSelectedRouteId]);

  useEffect(() => {
    if (isNewRoute || initialCreationKindRef.current === 'routes') {
      return;
    }

    const nextWaypoints = getRouteWaypoints(selectedRoute);
    setDraftWaypoints(nextWaypoints);
    setSelectedWaypointIndex(null);
    setHoveredWaypointIndex(null);
    setFocusTarget(null);
    setIsRouteDirty(false);

    if (nextWaypoints.length > 0) {
      setFitRequest((currentRequest) => currentRequest + 1);
    }
  }, [isNewRoute, selectedRoute]);

  useEffect(() => {
    if (isNewPlace || initialCreationKindRef.current === 'places') {
      return;
    }

    setDraftPlaceCoords(
      selectedPlace == null
        ? null
        : { latitude: selectedPlace.latitude, longitude: selectedPlace.longitude },
    );
    setIsPlaceDirty(false);
  }, [isNewPlace, selectedPlace]);

  useEffect(() => {
    if (isNewRoute || isNewPlace) {
      initialCreationKindRef.current = null;
    }
  }, [isNewPlace, isNewRoute]);

  useEffect(() => {
    if (!hasDirtyDraft) {
      return;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasDirtyDraft]);

  useKeyboardShortcuts({
    onClose: () => setIsHelpOpen(false),
    onFocusSearch: () => searchRef.current?.focus(),
    onGoLibrary: () => navigateIfDraftSafe('/dashboard/library'),
    onGoMap: () => router.push('/dashboard/map'),
    onGoPlaces: () => navigateIfDraftSafe('/dashboard/library/places'),
    onGoRoutes: () => navigateIfDraftSafe('/dashboard/library/routes'),
    onNew: () => (activeKind === 'places' ? startNewPlace() : startNewRoute()),
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

  async function saveRoute(input: RouteInput) {
    const savedRoute =
      selectedRoute == null || isNewRoute
        ? await auth.apiRequest<Route>('/routes', {
            body: JSON.stringify(input),
            method: 'POST',
          })
        : await auth.apiRequest<Route>(`/routes/${selectedRoute.id}`, {
            body: JSON.stringify(input),
            method: 'PATCH',
          });

    setIsRouteDirty(false);
    setIsNewRoute(false);
    setSelectedRouteId(savedRoute.id);
    router.replace(`/dashboard/map?kind=routes&selected=${encodeURIComponent(savedRoute.id)}`);
    await refresh();
  }

  async function savePlace(input: PlaceInput) {
    const savedPlace =
      selectedPlace == null || isNewPlace
        ? await auth.apiRequest<Place>('/places', {
            body: JSON.stringify(input),
            method: 'POST',
          })
        : await auth.apiRequest<Place>(`/places/${selectedPlace.id}`, {
            body: JSON.stringify(input),
            method: 'PATCH',
          });

    setIsPlaceDirty(false);
    setIsNewPlace(false);
    setSelectedPlaceId(savedPlace.id);
    setDraftPlaceCoords({ latitude: savedPlace.latitude, longitude: savedPlace.longitude });
    router.replace(`/dashboard/map?kind=places&selected=${encodeURIComponent(savedPlace.id)}`);
    await refresh();
  }

  function confirmDraftDiscard(): boolean {
    return !hasDirtyDraft || window.confirm('Discard unsaved changes? Save first to keep them.');
  }

  function navigateIfDraftSafe(href: string) {
    if (confirmDraftDiscard()) {
      router.push(href);
    }
  }

  function selectMapKind(kind: MapKind) {
    if (kind === activeKind || !confirmDraftDiscard()) {
      return;
    }

    resetDraftState();
    setActiveKind(kind);
    setMobilePanel('picker');
    router.replace(`/dashboard/map?kind=${kind}`);
  }

  function selectRoute(routeId: string) {
    if (routeId === selectedRouteId && !isNewRoute) {
      setMobilePanel('inspector');
      return;
    }

    if (!confirmDraftDiscard()) {
      return;
    }

    resetDraftState();
    setActiveKind('routes');
    setSelectedRouteId(routeId);
    setMobilePanel('inspector');
    router.replace(`/dashboard/map?kind=routes&selected=${encodeURIComponent(routeId)}`);
  }

  function selectPlace(placeId: string) {
    if (placeId === selectedPlaceId && !isNewPlace) {
      setMobilePanel('inspector');
      return;
    }

    if (!confirmDraftDiscard()) {
      return;
    }

    resetDraftState();
    setActiveKind('places');
    setSelectedPlaceId(placeId);
    setMobilePanel('inspector');
    router.replace(`/dashboard/map?kind=places&selected=${encodeURIComponent(placeId)}`);
  }

  function startNewRoute() {
    if (!confirmDraftDiscard()) {
      return;
    }

    resetDraftState();
    setActiveKind('routes');
    setSelectedRouteId(null);
    setDraftWaypoints([]);
    setIsNewRoute(true);
    setRouteDraftNonce((current) => current + 1);
    setMobilePanel('inspector');
    router.replace('/dashboard/map?kind=routes&new=1');
  }

  function startNewPlace() {
    if (!confirmDraftDiscard()) {
      return;
    }

    resetDraftState();
    setActiveKind('places');
    setSelectedPlaceId(null);
    setDraftPlaceCoords(DEFAULT_MAP_CENTER);
    setIsNewPlace(true);
    setPlaceDraftNonce((current) => current + 1);
    setMobilePanel('inspector');
    router.replace('/dashboard/map?kind=places&new=1');
  }

  function resetDraftState() {
    setIsRouteDirty(false);
    setIsPlaceDirty(false);
    setIsNewRoute(false);
    setIsNewPlace(false);
  }

  function refreshMapData() {
    if (!confirmDraftDiscard()) {
      return;
    }

    if (isRouteDirty) {
      setDraftWaypoints(isNewRoute ? [] : getRouteWaypoints(selectedRoute));
      setRouteDraftNonce((current) => current + 1);
    }
    if (isPlaceDirty) {
      setDraftPlaceCoords(
        selectedPlace == null || isNewPlace
          ? DEFAULT_MAP_CENTER
          : { latitude: selectedPlace.latitude, longitude: selectedPlace.longitude },
      );
      setPlaceDraftNonce((current) => current + 1);
    }
    setIsRouteDirty(false);
    setIsPlaceDirty(false);
    void refresh();
  }

  const map =
    activeKind === 'places' ? (
      <CartographerPlaceMap
        draftCoords={activePlaceCoords}
        places={places}
        selectedPlaceId={isNewPlace ? null : selectedPlaceId}
        onChangeDraftCoords={setDraftPlaceCoords}
        onReady={setViewportControls}
        onSelectPlace={selectPlace}
      />
    ) : (
      <RouteMapEditor
        className="cartographer-map"
        fitRequest={fitRequest}
        focusTarget={focusTarget}
        hoveredWaypointIndex={hoveredWaypointIndex}
        selectedWaypointIndex={selectedWaypointIndex}
        waypoints={draftWaypoints}
        onChange={setDraftWaypoints}
        onHoverWaypoint={setHoveredWaypointIndex}
        onReady={setViewportControls}
        onSelectWaypoint={setSelectedWaypointIndex}
      />
    );
  const selectedLabel =
    activeKind === 'places'
      ? isNewPlace
        ? 'New place'
        : (selectedPlace?.name ?? 'Choose a place')
      : isNewRoute
        ? 'New route'
        : (selectedRoute?.name ?? 'Choose a route');

  return (
    <Stage
      isLeftPanelCollapsed={isLibraryCollapsed}
      isRightPanelCollapsed={isInspectorCollapsed}
      map={map}
      mobilePanel={mobilePanel}
      mode={activeKind}
      selectedItemLabel={selectedLabel}
      workspace="map"
      onBeforeWorkspaceChange={confirmDraftDiscard}
      onMobilePanelChange={setMobilePanel}
      onToggleLeftPanel={() => setIsLibraryCollapsed((current) => !current)}
      onToggleMapFocus={() => {
        const shouldRestorePanels = isLibraryCollapsed && isInspectorCollapsed;
        setIsLibraryCollapsed(!shouldRestorePanels);
        setIsInspectorCollapsed(!shouldRestorePanels);
      }}
      onToggleRightPanel={() => setIsInspectorCollapsed((current) => !current)}
    >
      <StatusStrip
        error={error}
        isRefreshing={isLoading}
        lastUpdatedLabel={lastUpdatedLabel}
        onRefresh={refreshMapData}
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
        selectedPlaceId={isNewPlace ? null : selectedPlaceId}
        selectedRouteId={isNewRoute ? null : selectedRouteId}
        onNew={activeKind === 'places' ? startNewPlace : startNewRoute}
        onQueryChange={setQuery}
        onSelectKind={selectMapKind}
        onSelectPlace={selectPlace}
        onSelectRoute={selectRoute}
      />
      {activeKind === 'routes' ? (
        <IndexCard
          eyebrow={<span>Map / Routes</span>}
          stamp={
            selectedRoute?.currentRevision == null || isNewRoute
              ? undefined
              : `Revision ${selectedRoute.currentRevision.revisionNumber}`
          }
          title={selectedLabel}
          variant="route"
        >
          {selectedRoute == null && !isNewRoute ? (
            <MapEmptySelection kind="route" />
          ) : (
            <RouteEditor
              compactSummary
              key={
                isNewRoute
                  ? `new-route-${routeDraftNonce}`
                  : `${selectedRoute?.id ?? 'route'}-${routeDraftNonce}`
              }
              hoveredWaypointIndex={hoveredWaypointIndex}
              mapMode="background"
              places={places}
              route={isNewRoute ? null : selectedRoute}
              selectedWaypointIndex={selectedWaypointIndex}
              waypoints={draftWaypoints}
              onDirtyChange={setIsRouteDirty}
              onFocusTargetChange={setFocusTarget}
              onHoverWaypointIndexChange={setHoveredWaypointIndex}
              onSave={saveRoute}
              onSelectedWaypointIndexChange={setSelectedWaypointIndex}
              onWaypointsChange={setDraftWaypoints}
            />
          )}
        </IndexCard>
      ) : (
        <IndexCard
          actions={
            selectedPlace == null || isNewPlace ? undefined : (
              <PlaceRemoteControlAction key={selectedPlace.id} place={selectedPlace} />
            )
          }
          eyebrow={<span>Map / Places</span>}
          meta={
            <div className="index-card-coordinate-grid font-mono">
              <span>lat {formatCoord(activePlaceCoords.latitude)}</span>
              <span>lng {formatCoord(activePlaceCoords.longitude)}</span>
            </div>
          }
          subtitle="Move the pin or enter exact coordinates, then save."
          title={selectedLabel}
          variant="place"
        >
          {selectedPlace == null && !isNewPlace ? (
            <MapEmptySelection kind="place" />
          ) : (
            <PlaceEditor
              compactDetails
              draftCoords={activePlaceCoords}
              key={
                isNewPlace
                  ? `new-place-${placeDraftNonce}`
                  : `${selectedPlace?.id ?? 'place'}-${placeDraftNonce}`
              }
              onCoordinatesChange={setDraftPlaceCoords}
              onDirtyChange={setIsPlaceDirty}
              onDiscard={(coords) => {
                setDraftPlaceCoords(coords);
                setIsPlaceDirty(false);
              }}
              onSave={savePlace}
              place={isNewPlace ? null : selectedPlace}
              showHeader={false}
              showMap={false}
            />
          )}
        </IndexCard>
      )}
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
  onNew,
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
  onNew: () => void;
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
    <aside className="field-notebook map-library-panel" aria-label="Map item picker">
      <div aria-hidden className="field-notebook-spine" />
      <nav aria-label="Map item type" className="sidebar-tabs">
        <button
          className={activeKind === 'places' ? 'active' : ''}
          type="button"
          onClick={() => onSelectKind('places')}
        >
          Places
        </button>
        <button
          className={activeKind === 'routes' ? 'active' : ''}
          type="button"
          onClick={() => onSelectKind('routes')}
        >
          Routes
        </button>
      </nav>
      <div className="map-picker-tools">
        <label className="sidebar-search font-mono">
          <span className="sr-only">Search map items</span>
          <input
            ref={searchRef}
            placeholder={`Search ${activeKind}…`}
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
          />
        </label>
        <button className="secondary map-picker-new" type="button" onClick={onNew}>
          New
        </button>
      </div>
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
            <Link href={`/dashboard/library/${activeKind}`}>Browse Library</Link>
          </div>
        ) : null}
      </div>
    </aside>
  );
}

function MapEmptySelection({ kind }: { kind: 'place' | 'route' }) {
  return (
    <div className="map-empty-selection">
      <h3>Choose a {kind}</h3>
      <p className="muted">Select one from the picker, or create a new {kind} to begin.</p>
    </div>
  );
}

function filterPlaces(places: Place[], query: string): Place[] {
  const normalizedQuery = query.trim().toLowerCase();

  return normalizedQuery.length === 0
    ? places
    : places.filter((place) =>
        [place.name, place.description ?? '', ...place.tags]
          .join(' ')
          .toLowerCase()
          .includes(normalizedQuery),
      );
}

function filterRoutes(routes: Route[], query: string): Route[] {
  const normalizedQuery = query.trim().toLowerCase();

  return normalizedQuery.length === 0
    ? routes
    : routes.filter((route) =>
        [route.name, route.description ?? '', formatMode(route.mode)]
          .join(' ')
          .toLowerCase()
          .includes(normalizedQuery),
      );
}

function getRouteWaypoints(route: Route | null): RouteWaypoint[] {
  return (
    route?.currentRevision?.waypoints.map((waypoint) => ({
      latitude: waypoint.latitude,
      longitude: waypoint.longitude,
    })) ?? []
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
