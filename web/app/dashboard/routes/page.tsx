'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import DashboardShell from '@/components/dashboard/DashboardShell';
import RouteEditor from '@/components/dashboard/RouteEditor';
import { useDashboardAuth } from '@/components/dashboard/useDashboardAuth';
import { formatError, formatMode } from '@/components/dashboard/utils';
import type { Place, Route, RouteInput } from '@/lib/api';

export default function RoutesDashboardPage() {
  const auth = useDashboardAuth();
  const [places, setPlaces] = useState<Place[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isRouteSheetOpen, setIsRouteSheetOpen] = useState(false);
  const [lastLoadedAt, setLastLoadedAt] = useState<Date | null>(null);

  const selectedRoute = useMemo(
    () => routes.find((route) => route.id === selectedRouteId) ?? null,
    [routes, selectedRouteId],
  );

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

  function selectRoute(routeId: string | null) {
    setSelectedRouteId(routeId);
    setIsRouteSheetOpen(false);
  }

  return (
    <DashboardShell
      activeSection="routes"
      isRefreshing={isLoading}
      lastUpdatedLabel={lastLoadedAt?.toLocaleTimeString() ?? null}
      onLogout={auth.logout}
      onRefresh={() => void loadRoutes()}
      username={auth.session.user.username}
    >
      {error == null ? null : <div className="error dashboard-error">{error}</div>}

      <section className="dashboard-grid kc-workspace">
        <aside
          className={`dashboard-sidebar route-sidebar${isSidebarOpen ? '' : ' collapsed'}${
            isRouteSheetOpen ? ' mobile-open' : ''
          }`}
          id="route-list-panel"
        >
          <div className="card stack">
            <div className="dashboard-sidebar-header">
              <h2 className="dashboard-sidebar-title">Routes</h2>
              <div className="row dashboard-sidebar-actions">
                <button
                  aria-expanded={isSidebarOpen}
                  aria-label={isSidebarOpen ? 'Collapse routes sidebar' : 'Expand routes sidebar'}
                  className="secondary dashboard-sidebar-toggle"
                  type="button"
                  onClick={() => setIsSidebarOpen((current) => !current)}
                >
                  {isSidebarOpen ? '‹' : '›'}
                </button>
                <button
                  className="secondary dashboard-sidebar-new dashboard-sidebar-new-card button-icon-label"
                  type="button"
                  onClick={() => selectRoute(null)}
                >
                  <PlusIcon />
                  New route
                </button>
                <button
                  aria-label="Close routes"
                  className="secondary dashboard-sidebar-close"
                  type="button"
                  onClick={() => setIsRouteSheetOpen(false)}
                >
                  ×
                </button>
              </div>
            </div>
            <div className="dashboard-sidebar-content">
              {isLoading ? <SidebarSkeleton /> : null}
              <div className="list">
                {routes.map((route) => (
                  <button
                    className={`list-item route-list-item ${selectedRouteId === route.id ? 'active' : ''}`}
                    key={route.id}
                    type="button"
                    onClick={() => selectRoute(route.id)}
                  >
                    <span className="route-card-title-row">
                      <strong className="route-card-title">{route.name}</strong>
                      <span className="route-card-rev">
                        rev {route.currentRevision?.revisionNumber ?? '—'}
                      </span>
                      {route.isPublic ? <span className="route-card-status">public</span> : null}
                    </span>
                    <span className="route-card-meta-row">
                      <span className="route-card-metrics">
                        {formatRouteDistance(route)} · {route.defaultSpeedKmh}km/h
                      </span>
                      <span className="route-mode-chip">{formatMode(route.mode)}</span>
                    </span>
                  </button>
                ))}
                {routes.length === 0 && !isLoading ? (
                  <div className="empty-state">
                    <p className="muted">No routes yet.</p>
                    <button className="secondary" type="button" onClick={() => selectRoute(null)}>
                      Create your first route
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </aside>

        <button
          aria-controls="route-list-panel"
          aria-expanded={isRouteSheetOpen}
          className="secondary mobile-route-sheet-trigger"
          type="button"
          onClick={() => setIsRouteSheetOpen((current) => !current)}
        >
          ≡ Routes ({routes.length})
        </button>

        <section aria-busy={isLoading} className="grid dashboard-route-editor">
          {isLoading ? <div className="loading-shimmer" /> : null}
          <RouteEditor
            key={selectedRoute?.id ?? 'new-route'}
            onDelete={selectedRoute == null ? undefined : () => void deleteRoute(selectedRoute.id)}
            onSave={(input) => void saveRoute(input)}
            places={places}
            route={selectedRoute}
          />
        </section>
      </section>
    </DashboardShell>
  );
}

function SidebarSkeleton() {
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
    return `${distanceKm.toFixed(1)}km`;
  }

  return `${Math.round(distanceKm)}km`;
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

function PlusIcon() {
  return (
    <svg aria-hidden="true" className="lucide-icon" fill="none" viewBox="0 0 24 24">
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}
