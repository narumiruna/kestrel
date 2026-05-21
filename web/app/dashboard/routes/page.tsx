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
import { formatError, formatMode } from '@/components/dashboard/utils';
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
  const [places, setPlaces] = useState<Place[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastLoadedAt, setLastLoadedAt] = useState<Date | null>(null);
  const [routeQuery, setRouteQuery] = useState('');
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [viewportControls, setViewportControls] = useState<RouteMapControls | null>(null);
  const [draftWaypoints, setDraftWaypoints] = useState<RouteWaypoint[]>([]);
  const [selectedWaypointIndex, setSelectedWaypointIndex] = useState<number | null>(null);
  const [focusTarget, setFocusTarget] = useState<RouteWaypoint | null>(null);

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
      setRoutes(nextRoutes);
      setPlaces(nextPlaces);
      setSelectedRouteId((current) => current ?? nextRoutes[0]?.id ?? null);
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
    setDraftWaypoints(
      selectedRoute?.currentRevision?.waypoints.map((waypoint) => ({
        latitude: waypoint.latitude,
        longitude: waypoint.longitude,
      })) ?? [],
    );
    setSelectedWaypointIndex(null);
    setFocusTarget(null);
  }, [selectedRoute]);

  const createNewRoute = useCallback(() => {
    setSelectedRouteId(null);
  }, []);

  useKeyboardShortcuts({
    onClose: () => setIsHelpOpen(false),
    onFocusSearch: () => searchRef.current?.focus(),
    onGoPlaces: () => router.push('/dashboard/places'),
    onGoRoutes: () => router.push('/dashboard/routes'),
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
          focusTarget={focusTarget}
          selectedWaypointIndex={selectedWaypointIndex}
          waypoints={selectedWaypoints}
          onChange={setDraftWaypoints}
          onReady={setViewportControls}
          onSelectWaypoint={setSelectedWaypointIndex}
        />
      }
      mode="routes"
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
      <FieldNotebook
        activeSection="routes"
        count={routes.length}
        newLabel="New route"
        searchPlaceholder="Find a route"
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
            onClick={() => setSelectedRouteId(route.id)}
          >
            <span className="route-card-title-row">
              <strong>{route.name}</strong>
              {route.isPublic ? <span className="route-card-status">public</span> : null}
            </span>
            <span className="font-mono">
              {formatRouteDistance(route)} · {route.defaultSpeedKmh} km/h · {formatMode(route.mode)}
            </span>
            <span className="route-card-rev font-mono">
              rev {route.currentRevision?.revisionNumber ?? '—'}
            </span>
          </button>
        ))}
        {filteredRoutes.length === 0 && !isLoading ? (
          <div className="notebook-empty">
            <p className="muted no-margin">No matching routes on this page.</p>
            <button className="secondary" type="button" onClick={createNewRoute}>
              Create your first route
            </button>
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
            ? 'draft route'
            : `revision ${selectedRoute.currentRevision?.revisionNumber ?? '—'}`
        }
        subtitle="Build the path, tune playback, and publish the latest route when ready."
        title={selectedRoute?.name ?? 'New route'}
        variant="route"
        meta={<RouteMeta route={selectedRoute} />}
      >
        <RouteEditor
          key={selectedRoute?.id ?? 'new-route'}
          onDelete={selectedRoute == null ? undefined : () => void deleteRoute(selectedRoute.id)}
          mapMode="background"
          places={places}
          route={selectedRoute}
          selectedWaypointIndex={selectedWaypointIndex}
          waypoints={draftWaypoints}
          onFocusTargetChange={setFocusTarget}
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

function RouteMeta({ route }: { route: Route | null }) {
  if (route == null) {
    return (
      <div className="index-card-coordinate-grid font-mono">
        <span>0 waypoints</span>
        <span>draft</span>
      </div>
    );
  }

  const waypointCount = route.currentRevision?.waypoints.length ?? 0;

  return (
    <div className="index-card-coordinate-grid font-mono">
      <span>
        {waypointCount} waypoint{waypointCount === 1 ? '' : 's'}
      </span>
      <span>{formatRouteDistance(route)}</span>
      <span>{route.defaultSpeedKmh} km/h</span>
      <span>{formatMode(route.mode)}</span>
    </div>
  );
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
  const waypoints = route.currentRevision?.waypoints ?? [];
  const distanceKm = waypoints.slice(1).reduce((totalDistance, waypoint, index) => {
    const previousWaypoint = waypoints[index];

    return totalDistance + getDistanceKm(previousWaypoint, waypoint);
  }, 0);

  if (distanceKm < 10) {
    return `${distanceKm.toFixed(1)} km`;
  }

  return `${Math.round(distanceKm)} km`;
}

function getDistanceKm(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
): number {
  const earthRadiusKm = 6371;
  const deltaLatitude = toRadians(to.latitude - from.latitude);
  const deltaLongitude = toRadians(to.longitude - from.longitude);
  const fromLatitude = toRadians(from.latitude);
  const toLatitude = toRadians(to.latitude);
  const haversine =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(fromLatitude) * Math.cos(toLatitude) * Math.sin(deltaLongitude / 2) ** 2;

  return 2 * earthRadiusKm * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
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
