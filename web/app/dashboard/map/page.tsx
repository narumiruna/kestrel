'use client';

import { IconButton, TextField } from '@radix-ui/themes';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import {
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import { IndexCard } from '@/components/cartographer/IndexCard';
import { KeyboardCheatsheet } from '@/components/cartographer/KeyboardCheatsheet';
import { ScaleBar } from '@/components/cartographer/ScaleBar';
import { type MobileWorkspacePanel, Stage } from '@/components/cartographer/Stage';
import { useKeyboardShortcuts } from '@/components/cartographer/useKeyboardShortcuts';
import { AiConfigurationSummary } from '@/components/dashboard/AiConfigurationSummary';
import { matchesPlaceSearch, matchesRouteSearch } from '@/components/dashboard/librarySearch';
import PlaceEditor from '@/components/dashboard/PlaceEditor';
import { RouteAssistant } from '@/components/dashboard/RouteAssistant';
import RouteEditor from '@/components/dashboard/RouteEditor';
import {
  createRouteDraftState,
  getSelectedWaypointIndex,
  isRouteDraftDirty,
  type RouteDraftState,
  rebaseRouteDraftAfterSave,
  refreshRouteDraftFromRoute,
  replaceRoutePath,
  resetRouteDraft,
} from '@/components/dashboard/routeDraftState';
import { routeWorkflowReducer } from '@/components/dashboard/routeWorkflow';
import { useDashboardLibraryData } from '@/components/dashboard/useDashboardLibraryData';
import {
  formatCoord,
  formatMode,
  formatRouteDistanceFromWaypoints,
} from '@/components/dashboard/utils';
import { DEFAULT_MAP_CENTER } from '@/components/mapStyle';
import { isCurrentTabNavigation } from '@/components/navigation';
import {
  getRouteViewportControlState,
  type RouteMapCapability,
} from '@/components/routeMapCapability';
import { CheckIcon, Cross2Icon, MagnifyingGlassIcon, PlusIcon } from '@/components/ui/icons';
import { Button, ConfirmDialog, TextInput, Toggle, ToggleGroup } from '@/components/ui/radix-ui';
import { WorkspaceHeader } from '@/components/WorkspaceHeader';
import { formatRelativeUpdated } from '@/i18n/format';
import type { Place, PlaceInput, Route, RouteInput, RouteWaypoint } from '@/lib/api';
import type { AssistantProposal, AssistantSnapshot } from '@/lib/route-assistant';

const CartographerPlaceMap = dynamic(
  () => import('@/components/cartographer/CartographerPlaceMap'),
  { ssr: false },
);
const RouteMapEditor = dynamic(() => import('@/components/RouteMapEditor'), { ssr: false });
const ZoomStack = dynamic(
  () => import('@/components/cartographer/ZoomStack').then((module) => module.ZoomStack),
  { ssr: false },
);

import { createDraftActionGuard } from './navigationGuard';

type MapKind = 'places' | 'routes';
type ViewportControls = {
  fit: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
};

type Coordinates = { latitude: number; longitude: number };

export default function DashboardMapPage() {
  const t = useTranslations('MapWorkspace');
  const placeT = useTranslations('PlaceEditor');
  const [draftActionGuard] = useState(createDraftActionGuard);
  const locale = useLocale();
  const tm = useTranslations('routeModes');
  const {
    auth,
    error,
    isLoading,
    lastLoadedAt,
    places,
    placesError,
    refresh,
    refreshPlaces,
    routes,
    routesError,
    selectedPlaceId,
    selectedRouteId,
    setSelectedPlaceId,
    setSelectedRouteId,
    upsertRoute,
  } = useDashboardLibraryData();
  const router = useRouter();
  const searchRef = useRef<HTMLInputElement | null>(null);
  const pendingDraftRestoreFocusRef = useRef<HTMLElement | null>(null);
  const hasAppliedInitialRequestRef = useRef(false);
  const initialCreationKindRef = useRef<MapKind | null>(null);
  const routeDraftRouteIdRef = useRef<string | null>(null);
  const routeSaveInFlightRef = useRef(false);
  const [isRouteSaving, setIsRouteSaving] = useState(false);
  const [activeKind, setActiveKind] = useState<MapKind>('routes');
  const [query, setQuery] = useState('');
  const [viewportControls, setViewportControls] = useState<ViewportControls | null>(null);
  const [isLibraryCollapsed, setIsLibraryCollapsed] = useState(false);
  const [isInspectorCollapsed, setIsInspectorCollapsed] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<MobileWorkspacePanel>('map');
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [routeDraftState, setRouteDraftState] = useState<RouteDraftState>(() =>
    createRouteDraftState(null),
  );
  const [selectedWaypointId, setSelectedWaypointId] = useState<string | null>(null);
  const [{ mode: routeMode, isAdding: isAddingWaypoint }, dispatchWorkflow] = useReducer(
    routeWorkflowReducer,
    { mode: 'view', isAdding: false },
  );
  const isPointEditing = routeMode === 'edit';
  const [hoveredWaypointIndex, setHoveredWaypointIndex] = useState<number | null>(null);
  const [focusTarget, setFocusTarget] = useState<RouteWaypoint | null>(null);
  const [fitRequest, setFitRequest] = useState(0);
  const [isNewRoute, setIsNewRoute] = useState(false);
  const [routeMapCapability, setRouteMapCapability] = useState<RouteMapCapability>('loading');
  const [assistantCandidate, setAssistantCandidate] = useState<AssistantProposal | null>(null);
  const [captureMap, setCaptureMap] = useState<
    ((signal: AbortSignal) => Promise<Omit<AssistantSnapshot, 'binding'>>) | null
  >(null);
  const [captureViewGeneration, setCaptureViewGeneration] = useState(0);
  const [newAssistantRouteId, setNewAssistantRouteId] = useState(
    () => `new:${crypto.randomUUID()}`,
  );
  const captureReady = useCallback(
    (capture: typeof captureMap) => setCaptureMap(() => capture),
    [],
  );
  const captureViewChanged = useCallback(() => setCaptureViewGeneration((value) => value + 1), []);
  const [draftPlaceCoords, setDraftPlaceCoords] = useState<Coordinates | null>(null);
  const [isPlaceDirty, setIsPlaceDirty] = useState(false);
  const [isNewPlace, setIsNewPlace] = useState(false);
  const [placeDraftNonce, setPlaceDraftNonce] = useState(0);
  const [pendingDraftAction, setPendingDraftAction] = useState<(() => void) | null>(null);

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
  const filteredPlaces = useMemo(
    () => filterPlaces(places, query, locale),
    [places, query, locale],
  );
  const filteredRoutes = useMemo(
    () => filterRoutes(routes, query, locale, tm),
    [query, routes, locale, tm],
  );
  const lastUpdatedLabel = useRelativeUpdatedLabel(lastLoadedAt);
  const isRouteDirty = isRouteDraftDirty(routeDraftState);
  const draftWaypoints = routeDraftState.draft.waypoints;
  const routeViewportControls = getRouteViewportControlState(
    routeMapCapability,
    draftWaypoints.length,
  );
  const selectedWaypointIndex = getSelectedWaypointIndex(draftWaypoints, selectedWaypointId);
  function setSelectedWaypointIndex(index: number | null) {
    setSelectedWaypointId(index == null ? null : (draftWaypoints[index]?.draftId ?? null));
  }

  useEffect(() => {
    if (!isAddingWaypoint) return;
    const cancelAdding = (event: KeyboardEvent) => {
      if (event.key === 'Escape') dispatchWorkflow({ type: 'cancel-add' });
    };
    window.addEventListener('keydown', cancelAdding);
    return () => window.removeEventListener('keydown', cancelAdding);
  }, [isAddingWaypoint]);
  useEffect(() => {
    void selectedRouteId;
    dispatchWorkflow({ type: 'cancel-add' });
  }, [selectedRouteId]);
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
      routeDraftRouteIdRef.current = null;
      setRouteDraftState(createRouteDraftState(null));
      setIsNewRoute(true);
      dispatchWorkflow({ type: 'mode', mode: 'edit' });
      setMobilePanel('inspector');
    } else if (routes.some((route) => route.id === requestedId)) {
      setSelectedRouteId(requestedId);
    }
  }, [isLoading, places, routes, setSelectedPlaceId, setSelectedRouteId]);

  useEffect(() => {
    if (isNewRoute || initialCreationKindRef.current === 'routes') {
      return;
    }

    const routeId = selectedRoute?.id ?? null;
    const isRouteSelectionChange = routeDraftRouteIdRef.current !== routeId;
    routeDraftRouteIdRef.current = routeId;
    setRouteDraftState((currentState) =>
      isRouteSelectionChange
        ? createRouteDraftState(selectedRoute)
        : refreshRouteDraftFromRoute(currentState, selectedRoute),
    );

    if (!isRouteSelectionChange) {
      return;
    }

    const nextWaypoints = getRouteWaypoints(selectedRoute);
    dispatchWorkflow({ type: 'mode', mode: 'view' });
    setSelectedWaypointId(null);
    setHoveredWaypointIndex(null);
    setFocusTarget(null);

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
        <p className="muted">{t('loadingSession')}</p>
      </main>
    );
  }

  async function saveRoute(input: RouteInput) {
    if (routeSaveInFlightRef.current) throw new Error('A route save is already in progress.');
    routeSaveInFlightRef.current = true;
    setIsRouteSaving(true);
    try {
      const submittedState = routeDraftState;
      const routeId = selectedRoute?.id ?? selectedRouteId;
      const savedRoute =
        routeId == null
          ? await auth.apiRequest<Route>('/routes', {
              body: JSON.stringify(input),
              method: 'POST',
            })
          : await auth.apiRequest<Route>(`/routes/${routeId}`, {
              body: JSON.stringify(input),
              method: 'PATCH',
            });

      routeDraftRouteIdRef.current = savedRoute.id;
      setRouteDraftState((currentState) =>
        rebaseRouteDraftAfterSave(currentState, submittedState, savedRoute),
      );
      upsertRoute(savedRoute);
      setIsNewRoute(false);
      router.replace(`/dashboard/map?kind=routes&selected=${encodeURIComponent(savedRoute.id)}`);
      await refresh();
    } finally {
      routeSaveInFlightRef.current = false;
      setIsRouteSaving(false);
    }
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

  function requestDraftAction(action: () => void) {
    if (hasDirtyDraft || routeSaveInFlightRef.current) {
      const activeElement = document.activeElement;
      pendingDraftRestoreFocusRef.current =
        activeElement instanceof HTMLElement && activeElement !== document.body
          ? activeElement
          : document.querySelector<HTMLElement>('.notebook-entry[aria-pressed="true"]');
      draftActionGuard.request(true, action);
      setPendingDraftAction(() => () => draftActionGuard.confirm());
    } else {
      draftActionGuard.request(false, action);
    }
  }

  function navigateIfDraftSafe(href: string) {
    requestDraftAction(() => router.push(href));
  }

  function selectMapKind(kind: MapKind) {
    if (kind === activeKind) {
      return;
    }

    requestDraftAction(() => {
      resetDraftState();
      setActiveKind(kind);
      setMobilePanel('picker');
      router.replace(`/dashboard/map?kind=${kind}`);
    });
  }

  function selectRoute(routeId: string) {
    if (routeId === selectedRouteId && !isNewRoute) {
      setMobilePanel('inspector');
      return;
    }

    requestDraftAction(() => {
      resetDraftState();
      setActiveKind('routes');
      setSelectedRouteId(routeId);
      setMobilePanel('inspector');
      router.replace(`/dashboard/map?kind=routes&selected=${encodeURIComponent(routeId)}`);
    });
  }

  function selectPlace(placeId: string) {
    if (placeId === selectedPlaceId && !isNewPlace) {
      setMobilePanel('inspector');
      return;
    }

    requestDraftAction(() => {
      resetDraftState();
      setActiveKind('places');
      setSelectedPlaceId(placeId);
      setMobilePanel('inspector');
      router.replace(`/dashboard/map?kind=places&selected=${encodeURIComponent(placeId)}`);
    });
  }

  function startNewRoute() {
    requestDraftAction(() => {
      resetDraftState();
      setNewAssistantRouteId(`new:${crypto.randomUUID()}`);
      dispatchWorkflow({ type: 'mode', mode: 'edit' });
      setActiveKind('routes');
      setSelectedRouteId(null);
      routeDraftRouteIdRef.current = null;
      setRouteDraftState(createRouteDraftState(null));
      setIsNewRoute(true);
      setMobilePanel('inspector');
      router.replace('/dashboard/map?kind=routes&new=1');
    });
  }

  function startNewPlace() {
    requestDraftAction(() => {
      resetDraftState();
      setActiveKind('places');
      setSelectedPlaceId(null);
      setDraftPlaceCoords(DEFAULT_MAP_CENTER);
      setIsNewPlace(true);
      setPlaceDraftNonce((current) => current + 1);
      setMobilePanel('inspector');
      router.replace('/dashboard/map?kind=places&new=1');
    });
  }

  function resetDraftState() {
    dispatchWorkflow({ type: 'cancel-add' });
    dispatchWorkflow({ type: 'mode', mode: 'view' });
    setSelectedWaypointId(null);
    setHoveredWaypointIndex(null);
    setFocusTarget(null);
    setRouteDraftState(resetRouteDraft);
    setIsPlaceDirty(false);
    setIsNewRoute(false);
    setIsNewPlace(false);
  }

  function refreshMapData() {
    requestDraftAction(() => {
      if (isRouteDirty) {
        setRouteDraftState(createRouteDraftState(isNewRoute ? null : selectedRoute));
      }
      if (isPlaceDirty) {
        setDraftPlaceCoords(
          selectedPlace == null || isNewPlace
            ? DEFAULT_MAP_CENTER
            : { latitude: selectedPlace.latitude, longitude: selectedPlace.longitude },
        );
        setPlaceDraftNonce((current) => current + 1);
      }
      setIsPlaceDirty(false);
      void refresh();
    });
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
        isEditing={isPointEditing}
        isAdding={isAddingWaypoint}
        onCancelAdding={() => dispatchWorkflow({ type: 'cancel-add' })}
        selectedWaypointIndex={selectedWaypointIndex}
        waypoints={draftWaypoints}
        onCapabilityChange={setRouteMapCapability}
        onCaptureReady={captureReady}
        onCaptureViewChange={captureViewChanged}
        candidateWaypoints={assistantCandidate?.waypoints ?? null}
        onChange={(waypoints) => {
          const next = replaceRoutePath(routeDraftState, waypoints);
          setRouteDraftState(next);
          if (waypoints.length > draftWaypoints.length) {
            setSelectedWaypointId(next.draft.waypoints.at(-1)?.draftId ?? null);
          }
        }}
        onHoverWaypoint={setHoveredWaypointIndex}
        onReady={setViewportControls}
        onSelectWaypoint={setSelectedWaypointIndex}
      />
    );
  const selectedLabel =
    activeKind === 'places'
      ? isNewPlace
        ? t('newPlace')
        : (selectedPlace?.name ?? t('choosePlace'))
      : isNewRoute
        ? t('newRoute')
        : (selectedRoute?.name ?? t('chooseRoute'));

  return (
    <Stage
      isLeftPanelCollapsed={isLibraryCollapsed}
      isRightPanelCollapsed={isInspectorCollapsed}
      map={map}
      mobilePanel={mobilePanel}
      mode={activeKind}
      selectedItemLabel={selectedLabel}
      workspace="map"
      onMobilePanelChange={setMobilePanel}
      onToggleLeftPanel={() => setIsLibraryCollapsed((current) => !current)}
      onToggleRightPanel={() => setIsInspectorCollapsed((current) => !current)}
    >
      <WorkspaceHeader
        activeSection="map"
        isRefreshing={isLoading}
        statusError={error}
        statusLabel={lastUpdatedLabel == null ? null : t('updated', { time: lastUpdatedLabel })}
        username={auth.session.user.username}
        onBeforeWorkspaceChange={(href) => {
          navigateIfDraftSafe(href);
          return false;
        }}
        onLogout={auth.logout}
        onRefresh={refreshMapData}
      />
      <MapLibraryPanel
        activeKind={activeKind}
        filteredPlaces={filteredPlaces}
        filteredRoutes={filteredRoutes}
        isLoading={isLoading}
        itemCount={activeKind === 'places' ? places.length : routes.length}
        loadError={activeKind === 'places' ? placesError : routesError}
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
          eyebrow={<span>{t('mapRoutes')}</span>}
          stamp={
            selectedRoute?.currentRevision == null || isNewRoute
              ? undefined
              : t('revision', { count: selectedRoute.currentRevision.revisionNumber })
          }
          title={selectedLabel}
          variant="route"
        >
          {selectedRoute == null && !isNewRoute ? (
            <MapEmptySelection kind="route" />
          ) : (
            <RouteEditor
              key={isNewRoute ? newAssistantRouteId : selectedRoute?.id}
              assistant={
                <RouteAssistant
                  apiRequest={auth.apiRequest}
                  session={auth.session}
                  draftState={routeDraftState}
                  setDraftState={setRouteDraftState}
                  routeId={
                    isNewRoute ? newAssistantRouteId : (selectedRoute?.id ?? newAssistantRouteId)
                  }
                  viewGeneration={captureViewGeneration}
                  captureMap={captureMap ?? (() => Promise.reject(new Error('Map unavailable')))}
                  isSaving={isRouteSaving || routeMapCapability !== 'ready'}
                  onCandidateChange={setAssistantCandidate}
                  onNavigateSettings={() => navigateIfDraftSafe('/dashboard/account#ai-assistant')}
                  onApplied={() => {
                    setSelectedWaypointId(null);
                    setFocusTarget(null);
                    setFitRequest((request) => request + 1);
                  }}
                />
              }
              configurationSummary={
                <AiConfigurationSummary
                  apiRequest={auth.apiRequest}
                  onNavigate={(event) => {
                    if (!isCurrentTabNavigation(event)) return;
                    event.preventDefault();
                    navigateIfDraftSafe('/dashboard/account#ai-assistant');
                  }}
                />
              }
              isSaving={isRouteSaving}
              draftState={routeDraftState}
              hoveredWaypointIndex={hoveredWaypointIndex}
              places={places}
              placesError={placesError}
              route={isNewRoute ? null : selectedRoute}
              routeMapCapability={routeMapCapability}
              selectedWaypointIndex={selectedWaypointIndex}
              mode={routeMode}
              onModeChange={(mode) => {
                dispatchWorkflow({ type: 'mode', mode });
              }}
              onShowEntireRoute={() => {
                setMobilePanel('map');
                setFitRequest((request) => request + 1);
              }}
              isAddingWaypoint={isAddingWaypoint}
              onAddingWaypointChange={(adding) => {
                dispatchWorkflow({ type: adding ? 'start-add' : 'cancel-add' });
                if (adding) setMobilePanel('map');
              }}
              onSelectedWaypointIdChange={setSelectedWaypointId}
              setDraftState={setRouteDraftState}
              onBeforeNavigateAway={() => {
                navigateIfDraftSafe('/dashboard/library/places');
                return false;
              }}
              onDelete={
                selectedRoute == null || isNewRoute
                  ? undefined
                  : async () => {
                      await auth.apiRequest(`/routes/${selectedRoute.id}`, { method: 'DELETE' });
                      setSelectedRouteId(null);
                      routeDraftRouteIdRef.current = null;
                      setRouteDraftState(createRouteDraftState(null));
                      setIsNewRoute(false);
                      router.replace('/dashboard/map?kind=routes');
                      await refresh();
                    }
              }
              onFocusTargetChange={setFocusTarget}
              onRetryPlaces={() => void refreshPlaces()}
              onHoverWaypointIndexChange={setHoveredWaypointIndex}
              onSave={saveRoute}
              onSelectedWaypointIndexChange={setSelectedWaypointIndex}
            />
          )}
        </IndexCard>
      ) : (
        <IndexCard title={isNewPlace ? t('newPlace') : placeT('detailsTitle')} variant="place">
          {selectedPlace == null && !isNewPlace ? (
            <MapEmptySelection kind="place" />
          ) : (
            <PlaceEditor
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
            />
          )}
        </IndexCard>
      )}
      <ZoomStack
        isMapFocused={isLibraryCollapsed && isInspectorCollapsed}
        viewportDisabled={activeKind === 'routes' && routeViewportControls.viewportDisabled}
        fitDisabled={activeKind === 'routes' && routeViewportControls.fitDisabled}
        fitLabel={activeKind === 'routes' ? t('showEntireRoute') : t('fitToAllPins')}
        onFit={() => {
          if (activeKind === 'routes') setFitRequest((request) => request + 1);
          else viewportControls?.fit();
        }}
        onToggleMapFocus={() => {
          const shouldRestorePanels = isLibraryCollapsed && isInspectorCollapsed;
          setIsLibraryCollapsed(!shouldRestorePanels);
          setIsInspectorCollapsed(!shouldRestorePanels);
        }}
        onZoomIn={() => viewportControls?.zoomIn()}
        onZoomOut={() => viewportControls?.zoomOut()}
      />
      <ScaleBar hidden={activeKind === 'routes' && routeMapCapability !== 'ready'} />
      <KeyboardCheatsheet isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
      <ConfirmDialog
        cancelLabel={t('keepEditing')}
        confirmLabel={t('discardChanges')}
        description={
          isRouteSaving
            ? t('waitForTheRouteSaveToFinishBeforeLeavingThis')
            : t('yourUnsavedMapEditsWillBeLostSaveFirstIf')
        }
        disabled={isRouteSaving}
        open={pendingDraftAction != null}
        restoreFocusElement={pendingDraftRestoreFocusRef.current}
        title={t('discardUnsavedChanges')}
        onConfirm={() => {
          const action = pendingDraftAction;
          setPendingDraftAction(null);
          action?.();
        }}
        onOpenChange={(open) => {
          if (!open) {
            draftActionGuard.cancel();
            setPendingDraftAction(null);
          }
        }}
      />
    </Stage>
  );
}

function MapLibraryPanel({
  activeKind,
  filteredPlaces,
  filteredRoutes,
  isLoading,
  itemCount,
  loadError,
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
  itemCount: number;
  loadError: string | null;
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
  const t = useTranslations('MapWorkspace');
  const tm = useTranslations('routeModes');
  const locale = useLocale();
  const activeItems = activeKind === 'places' ? filteredPlaces : filteredRoutes;
  const isSearching = query.trim().length > 0;

  function clearSearch() {
    onQueryChange('');
    searchRef.current?.focus();
  }

  return (
    <aside className="field-notebook map-library-panel" aria-label={t('mapItemPicker')}>
      <div aria-hidden className="field-notebook-spine" />
      <ToggleGroup
        aria-label={t('mapItemType')}
        className="sidebar-tabs"
        type="single"
        value={activeKind}
        onValueChange={(nextKind) => {
          if (nextKind !== '') {
            onSelectKind(nextKind as MapKind);
          }
        }}
      >
        <Toggle value="places">{t('places')}</Toggle>
        <Toggle value="routes">{t('routes')}</Toggle>
      </ToggleGroup>
      <div className="map-picker-tools">
        <label
          htmlFor="radix-field-app-dashboard-map-page-tsx-1"
          className="sidebar-search font-mono"
        >
          <span className="sr-only">{t('searchMapItems')}</span>
          <TextInput
            id="radix-field-app-dashboard-map-page-tsx-1"
            ref={searchRef}
            placeholder={t('searchKind', { kind: activeKind })}
            type="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
          >
            <TextField.Slot>
              <MagnifyingGlassIcon aria-hidden />
            </TextField.Slot>
            {query.length === 0 ? null : (
              <TextField.Slot side="right">
                <IconButton
                  aria-label={t('clearMapSearch')}
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
        <Button
          aria-label={t('newKind', { kind: activeKind })}
          className="map-picker-new"
          type="button"
          variant="soft"
          onClick={onNew}
        >
          <PlusIcon aria-hidden /> {t('newKind', { kind: activeKind })}
        </Button>
      </div>
      <div className="notebook-list" aria-busy={isLoading}>
        {isLoading && itemCount === 0 ? <NotebookSkeleton /> : null}
        {activeKind === 'places'
          ? filteredPlaces.map((place) => (
              <Button
                aria-pressed={selectedPlaceId === place.id}
                className={`notebook-entry${selectedPlaceId === place.id ? ' active' : ''}`}
                key={place.id}
                type="button"
                onClick={() => onSelectPlace(place.id)}
              >
                {selectedPlaceId === place.id ? (
                  <span aria-hidden className="notebook-entry-selected-mark">
                    <CheckIcon />
                  </span>
                ) : null}
                <strong title={place.name}>{place.name}</strong>
                <span className="font-mono">
                  {formatCoord(place.latitude)}, {formatCoord(place.longitude)}
                </span>
              </Button>
            ))
          : filteredRoutes.map((route) => (
              <Button
                aria-pressed={selectedRouteId === route.id}
                className={`notebook-entry route-notebook-entry${selectedRouteId === route.id ? ' active' : ''}`}
                key={route.id}
                type="button"
                onClick={() => onSelectRoute(route.id)}
              >
                {selectedRouteId === route.id ? (
                  <span aria-hidden className="notebook-entry-selected-mark">
                    <CheckIcon />
                  </span>
                ) : null}
                <strong className="route-card-title" title={route.name}>
                  {route.name}
                </strong>
                <span className="route-card-meta-line">
                  {formatRouteDistanceFromWaypoints(route.currentRevision?.waypoints ?? [], locale)}{' '}
                  · {formatMode(route.mode, tm)}
                </span>
              </Button>
            ))}
        {activeItems.length === 0 && !isLoading ? (
          <div className="notebook-empty">
            <p className="muted no-margin" role="status">
              {loadError != null
                ? t('loadFailed', { kind: activeKind })
                : isSearching
                  ? t('noMatches', { kind: activeKind })
                  : t('noneYet', { kind: activeKind })}
            </p>
            {isSearching ? (
              <Button className="secondary" type="button" onClick={clearSearch}>
                {t('clearSearch')}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </aside>
  );
}

function MapEmptySelection({ kind }: { kind: 'place' | 'route' }) {
  const t = useTranslations('MapWorkspace');
  return (
    <div className="map-empty-selection">
      <h3>{t('chooseKind', { kind })}</h3>
      <p className="muted">{t('chooseKindHelp', { kind })}</p>
    </div>
  );
}

function filterPlaces(places: Place[], query: string, locale: string): Place[] {
  const normalizedQuery = query.trim().toLocaleLowerCase(locale);

  return normalizedQuery.length === 0
    ? places
    : places.filter((place) => matchesPlaceSearch(place, normalizedQuery, locale));
}

function filterRoutes(
  routes: Route[],
  query: string,
  locale: string,
  tm: Parameters<typeof formatMode>[1],
): Route[] {
  const normalizedQuery = query.trim().toLocaleLowerCase(locale);

  return normalizedQuery.length === 0
    ? routes
    : routes.filter((route) =>
        matchesRouteSearch(route, normalizedQuery, locale, formatMode(route.mode, tm)),
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
  const t = useTranslations('MapWorkspace');
  return (
    <div aria-label={t('loadingMapItems')} className="skeleton-list" role="status">
      <span className="skeleton-line wide" />
      <span className="skeleton-line" />
      <span className="skeleton-line short" />
    </div>
  );
}

function useRelativeUpdatedLabel(lastUpdatedAt: Date | null): string | null {
  const locale = useLocale();
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

  return formatRelativeUpdated(lastUpdatedAt, now, locale);
}
