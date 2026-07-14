'use client';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FieldNotebook } from '@/components/cartographer/FieldNotebook';
import { IndexCard } from '@/components/cartographer/IndexCard';
import { KeyboardCheatsheet } from '@/components/cartographer/KeyboardCheatsheet';
import { ScaleBar } from '@/components/cartographer/ScaleBar';
import { Stage } from '@/components/cartographer/Stage';
import { StatusStrip } from '@/components/cartographer/StatusStrip';
import { UserMark } from '@/components/cartographer/UserMark';
import { useKeyboardShortcuts } from '@/components/cartographer/useKeyboardShortcuts';
import RouteEditor from '@/components/dashboard/RouteEditor';
import { useDashboardAuth } from '@/components/dashboard/useDashboardAuth';
import {
  formatError,
  formatMode,
  formatRouteDistanceFromWaypoints,
} from '@/components/dashboard/utils';
import type { RouteMapControls } from '@/components/RouteMapEditor';
import type { Place, Route, RouteInput, RouteWaypoint } from '@/lib/api';

const RouteMapEditor = dynamic(() => import('@/components/RouteMapEditor'), {
  ssr: false,
});
const ZoomStack = dynamic(
  () => import('@/components/cartographer/ZoomStack').then((module) => module.ZoomStack),
  {
    ssr: false,
  },
);

export default function RoutesDashboardPage() {
  const auth = useDashboardAuth();
  const router = useRouter();
  const searchRef = useRef<HTMLInputElement | null>(null);
  const hasAppliedRequestedSelectionRef = useRef(false);
  const [places, setPlaces] = useState<Place[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastLoadedAt, setLastLoadedAt] = useState<Date | null>(null);
  const [routeQuery, setRouteQuery] = useState('');
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [viewportControls, setViewportControls] = useState<RouteMapControls | null>(null);
  const [fitRequest, setFitRequest] = useState(0);
  const [draftWaypoints, setDraftWaypoints] = useState<RouteWaypoint[]>([]);
  const [selectedWaypointIndex, setSelectedWaypointIndex] = useState<number | null>(null);
  const [hoveredWaypointIndex, setHoveredWaypointIndex] = useState<number | null>(null);
  const [focusTarget, setFocusTarget] = useState<RouteWaypoint | null>(null);
  const [isRouteDirty, setIsRouteDirty] = useState(false);
  const [newRouteDraftNonce, setNewRouteDraftNonce] = useState(0);
  const [isLibraryCollapsed, setIsLibraryCollapsed] = useState(false);
  const [isEditorCollapsed, setIsEditorCollapsed] = useState(false);

  const selectedRoute = useMemo(
    () => routes.find((route) => route.id === selectedRouteId) ?? null,
    [routes, selectedRouteId],
  );
  const selectedWaypoints = draftWaypoints;
  const filteredRoutes = useMemo(() => {
    const normalizedQuery = routeQuery.trim().toLowerCase();

    if (normalizedQuery.length === 0) {
      return routes;
    }

    return routes.filter((route) =>
      [route.name, route.description ?? '', formatMode(route.mode), route.isPublic ? 'public' : '']
        .join(' ')
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [routeQuery, routes]);
  const lastUpdatedLabel = useRelativeUpdatedLabel(lastLoadedAt);

  const loadRoutes = useCallback(async () => {
    setError(null);
    setIsLoading(true);

    try {
      const [nextRoutes, nextPlaces] = await Promise.all([
        auth.apiRequest<Route[]>('/routes'),
        auth.apiRequest<Place[]>('/places'),
      ]);
      const requestedRouteId = hasAppliedRequestedSelectionRef.current
        ? null
        : readRequestedSelectionId();
      hasAppliedRequestedSelectionRef.current = true;
      setRoutes(nextRoutes);
      setPlaces(nextPlaces);
      setSelectedRouteId((current) =>
        nextRoutes.some((route) => route.id === requestedRouteId)
          ? requestedRouteId
          : nextRoutes.some((route) => route.id === current)
            ? current
            : (nextRoutes[0]?.id ?? null),
      );
      setLastLoadedAt(new Date());
    } catch (nextError) {
      setError(formatError(nextError));
    } finally {
      setIsLoading(false);
    }
  }, [auth]);

  useEffect(() => {
    if (!auth.isHydrated || !auth.isAuthenticated) {
      return;
    }

    void loadRoutes();
  }, [auth.isAuthenticated, auth.isHydrated, loadRoutes]);

  useEffect(() => {
    const nextWaypoints =
      selectedRoute?.currentRevision?.waypoints.map((waypoint) => ({
        latitude: waypoint.latitude,
        longitude: waypoint.longitude,
      })) ?? [];

    setDraftWaypoints(nextWaypoints);
    setSelectedWaypointIndex(null);
    setHoveredWaypointIndex(null);
    setFocusTarget(null);

    if (nextWaypoints.length > 0) {
      setFitRequest((currentRequest) => currentRequest + 1);
    }
  }, [selectedRoute]);

  const selectRoute = useCallback(
    (routeId: string) => {
      if (routeId === selectedRouteId) {
        return;
      }

      if (!confirmDiscardUnsavedChanges(isRouteDirty)) {
        return;
      }

      setIsRouteDirty(false);
      setSelectedRouteId(routeId);
    },
    [isRouteDirty, selectedRouteId],
  );

  const createNewRoute = useCallback(() => {
    if (!confirmDiscardUnsavedChanges(isRouteDirty)) {
      return;
    }

    setIsRouteDirty(false);
    setDraftWaypoints([]);
    setSelectedWaypointIndex(null);
    setFocusTarget(null);
    setSelectedRouteId(null);
    setNewRouteDraftNonce((currentNonce) => currentNonce + 1);
  }, [isRouteDirty]);

  useEffect(() => {
    if (!isRouteDirty) {
      return;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isRouteDirty]);

  useKeyboardShortcuts({
    onClose: () => setIsHelpOpen(false),
    onFocusSearch: () => searchRef.current?.focus(),
    onGoLibrary: () => router.push('/dashboard/library'),
    onGoMap: () => router.push('/dashboard/map'),
    onGoPlaces: () => router.push('/dashboard/library/places'),
    onGoRoutes: () => router.push('/dashboard/library/routes'),
    onNew: createNewRoute,
    onToggleHelp: () => setIsHelpOpen((current) => !current),
  });

  if (!auth.isHydrated || !auth.isAuthenticated || auth.session == null) {
    return (
      <main className="shell">
        <p className="muted">Loading session…</p>
      </main>
    );
  }

  async function saveRoute(input: RouteInput) {
    const savedRoute =
      selectedRoute == null
        ? await auth.apiRequest<Route>('/routes', {
            body: JSON.stringify(input),
            method: 'POST',
          })
        : await auth.apiRequest<Route>(`/routes/${selectedRoute.id}`, {
            body: JSON.stringify(input),
            method: 'PATCH',
          });

    await loadRoutes();
    setIsRouteDirty(false);
    setSelectedRouteId(savedRoute.id);
  }

  async function deleteRoute(routeId: string) {
    await auth.apiRequest(`/routes/${routeId}`, { method: 'DELETE' });
    await loadRoutes();
    setSelectedRouteId(null);
  }

  async function changePassword(input: { currentPassword: string; newPassword: string }) {
    await auth.apiRequest('/auth/password/change', {
      body: JSON.stringify(input),
      method: 'POST',
    });
  }

  return (
    <Stage
      map={
        <RouteMapEditor
          className="cartographer-map"
          fitRequest={fitRequest}
          focusTarget={focusTarget}
          hoveredWaypointIndex={hoveredWaypointIndex}
          selectedWaypointIndex={selectedWaypointIndex}
          waypoints={selectedWaypoints}
          onChange={setDraftWaypoints}
          onHoverWaypoint={setHoveredWaypointIndex}
          onReady={setViewportControls}
          onSelectWaypoint={setSelectedWaypointIndex}
        />
      }
      isLeftPanelCollapsed={isLibraryCollapsed}
      isRightPanelCollapsed={isEditorCollapsed}
      mode="routes"
      onToggleLeftPanel={() => setIsLibraryCollapsed((current) => !current)}
      onToggleMapFocus={() => {
        const shouldRestorePanels = isLibraryCollapsed && isEditorCollapsed;
        setIsLibraryCollapsed(!shouldRestorePanels);
        setIsEditorCollapsed(!shouldRestorePanels);
      }}
      onToggleRightPanel={() => setIsEditorCollapsed((current) => !current)}
      workspace="library"
    >
      <StatusStrip
        error={error}
        isRefreshing={isLoading}
        lastUpdatedLabel={lastUpdatedLabel}
        onRefresh={() => void loadRoutes()}
      />
      <UserMark
        username={auth.session.user.username}
        onChangePassword={changePassword}
        onLogout={auth.logout}
      />
      <div className="route-mode-bar" role="status">
        <strong>Editing route</strong>
        <span>Straight segments connect waypoints</span>
        <span>Click map to add pins; drag pins or rows to reorder</span>
      </div>
      <FieldNotebook
        activeSection="routes"
        newLabel="New route"
        searchPlaceholder="Search routes..."
        searchRef={searchRef}
        searchValue={routeQuery}
        onNewEntry={createNewRoute}
        onSearchChange={setRouteQuery}
      >
        {isLoading ? <NotebookSkeleton /> : null}
        {filteredRoutes.map((route) => (
          <button
            className={`notebook-entry route-notebook-entry${selectedRouteId === route.id ? ' active' : ''}`}
            key={route.id}
            type="button"
            onClick={() => selectRoute(route.id)}
          >
            <span className="route-card-title-row">
              <strong className="route-card-title">{route.name}</strong>
              {route.isPublic ? <span className="route-card-status">Public</span> : null}
            </span>
            <span className="route-card-meta-line">
              {formatRouteDistance(route)} · {route.defaultSpeedKmh} km/h · {formatMode(route.mode)}
              · Revision {route.currentRevision?.revisionNumber ?? '—'}
            </span>
            {selectedRouteId === route.id ? (
              <span className="route-card-selected-detail">
                {(route.currentRevision?.waypoints.length ?? 0).toLocaleString()} waypoints
                {route.description == null ? '' : ` · ${route.description}`}
              </span>
            ) : null}
          </button>
        ))}
        {filteredRoutes.length === 0 && !isLoading ? (
          <div className="notebook-empty">
            <p className="muted no-margin">
              {routes.length === 0
                ? 'No routes yet. Use New route to start with map pins or favorites.'
                : 'No routes match this search.'}
            </p>
          </div>
        ) : null}
      </FieldNotebook>
      <IndexCard
        eyebrow={
          <span>
            Routes / <span>{selectedRoute?.name ?? 'New route'}</span>
          </span>
        }
        stamp={
          selectedRoute == null
            ? 'Draft route'
            : `Revision ${selectedRoute.currentRevision?.revisionNumber ?? '—'}`
        }
        subtitle="Build the path, tune playback, and publish the latest route when ready."
        title={selectedRoute?.name ?? 'New route'}
        variant="route"
      >
        <RouteEditor
          key={selectedRoute?.id ?? `new-route-${newRouteDraftNonce}`}
          onDelete={selectedRoute == null ? undefined : () => void deleteRoute(selectedRoute.id)}
          onDirtyChange={setIsRouteDirty}
          hoveredWaypointIndex={hoveredWaypointIndex}
          mapMode="background"
          places={places}
          route={selectedRoute}
          selectedWaypointIndex={selectedWaypointIndex}
          waypoints={draftWaypoints}
          onFocusTargetChange={setFocusTarget}
          onHoverWaypointIndexChange={setHoveredWaypointIndex}
          onSave={(input) => void saveRoute(input)}
          onSelectedWaypointIndexChange={setSelectedWaypointIndex}
          onWaypointsChange={setDraftWaypoints}
        />
      </IndexCard>
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

function confirmDiscardUnsavedChanges(isDirty: boolean): boolean {
  return !isDirty || window.confirm('Discard unsaved changes? Save first to keep them.');
}

function readRequestedSelectionId(): string | null {
  return new URLSearchParams(window.location.search).get('selected');
}

function NotebookSkeleton() {
  return (
    <div aria-label="Loading routes" className="skeleton-list" role="status">
      <span className="skeleton-line wide" />
      <span className="skeleton-line" />
      <span className="skeleton-line short" />
    </div>
  );
}

function formatRouteDistance(route: Route): string {
  return formatRouteDistanceFromWaypoints(route.currentRevision?.waypoints ?? []);
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
