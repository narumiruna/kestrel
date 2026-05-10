'use client';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { ApiError, type Place, type PlaceInput, type Route, type RouteInput, type RouteMode, type RouteWaypoint } from '@/lib/api';

const RouteMapEditor = dynamic(() => import('@/components/RouteMapEditor'), {
  ssr: false,
});

export default function DashboardPage() {
  const auth = useAuth();
  const router = useRouter();
  const [places, setPlaces] = useState<Place[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const selectedPlace = useMemo(
    () => places.find((place) => place.id === selectedPlaceId) ?? null,
    [places, selectedPlaceId],
  );
  const selectedRoute = useMemo(
    () => routes.find((route) => route.id === selectedRouteId) ?? null,
    [routes, selectedRouteId],
  );

  const loadLibrary = useCallback(async () => {
    setError(null);
    setIsLoading(true);

    try {
      const [nextPlaces, nextRoutes] = await Promise.all([
        auth.apiRequest<Place[]>('/places'),
        auth.apiRequest<Route[]>('/routes'),
      ]);
      setPlaces(nextPlaces);
      setRoutes(nextRoutes);
      setSelectedPlaceId((current) => current ?? nextPlaces[0]?.id ?? null);
      setSelectedRouteId((current) => current ?? nextRoutes[0]?.id ?? null);
    } catch (nextError) {
      setError(formatError(nextError));
    } finally {
      setIsLoading(false);
    }
  }, [auth]);

  useEffect(() => {
    if (!auth.isHydrated) {
      return;
    }

    if (!auth.isAuthenticated) {
      router.replace('/login');
      return;
    }

    void loadLibrary();
  }, [auth.isAuthenticated, auth.isHydrated, loadLibrary, router]);

  async function savePlace(input: PlaceInput) {
    const savedPlace = selectedPlace == null
      ? await auth.apiRequest<Place>('/places', {
          body: JSON.stringify(input),
          method: 'POST',
        })
      : await auth.apiRequest<Place>(`/places/${selectedPlace.id}`, {
          body: JSON.stringify(input),
          method: 'PATCH',
        });

    await loadLibrary();
    setSelectedPlaceId(savedPlace.id);
  }

  async function deletePlace(placeId: string) {
    await auth.apiRequest(`/places/${placeId}`, { method: 'DELETE' });
    await loadLibrary();
    setSelectedPlaceId(null);
  }

  async function saveRoute(input: RouteInput) {
    const savedRoute = selectedRoute == null
      ? await auth.apiRequest<Route>('/routes', {
          body: JSON.stringify(input),
          method: 'POST',
        })
      : await auth.apiRequest<Route>(`/routes/${selectedRoute.id}`, {
          body: JSON.stringify(input),
          method: 'PATCH',
        });

    await loadLibrary();
    setSelectedRouteId(savedRoute.id);
  }

  async function deleteRoute(routeId: string) {
    await auth.apiRequest(`/routes/${routeId}`, { method: 'DELETE' });
    await loadLibrary();
    setSelectedRouteId(null);
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand">
          <strong>Kestrel Cloud</strong>
          <span className="muted">Signed in as {auth.session?.user.username}</span>
        </div>
        <div className="row">
          <button className="secondary" type="button" onClick={() => void loadLibrary()}>
            Refresh
          </button>
          <button className="secondary" type="button" onClick={auth.logout}>
            Logout
          </button>
        </div>
      </header>

      {error == null ? null : <div className="error" style={{ marginBottom: '1rem' }}>{error}</div>}

      <section className="dashboard-grid">
        <aside className="grid">
          <div className="card stack">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h2>Places</h2>
              <button className="secondary" type="button" onClick={() => setSelectedPlaceId(null)}>
                New
              </button>
            </div>
            {isLoading ? <p className="muted">Loading…</p> : null}
            <div className="list">
              {places.map((place) => (
                <button
                  className={`list-item ${selectedPlaceId === place.id ? 'active' : ''}`}
                  key={place.id}
                  type="button"
                  onClick={() => setSelectedPlaceId(place.id)}
                >
                  <strong>{place.name}</strong>
                  <span className="muted">{formatCoord(place.latitude)}, {formatCoord(place.longitude)}</span>
                  <TagRow tags={place.tags} />
                </button>
              ))}
              {places.length === 0 && !isLoading ? <p className="muted">No places yet.</p> : null}
            </div>
          </div>

          <div className="card stack">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h2>Routes</h2>
              <button className="secondary" type="button" onClick={() => setSelectedRouteId(null)}>
                New
              </button>
            </div>
            <div className="list">
              {routes.map((route) => (
                <button
                  className={`list-item ${selectedRouteId === route.id ? 'active' : ''}`}
                  key={route.id}
                  type="button"
                  onClick={() => setSelectedRouteId(route.id)}
                >
                  <strong>{route.name}</strong>
                  <span className="muted">
                    {route.currentRevision?.waypoints.length ?? 0} waypoints · {route.defaultSpeedKmh} km/h · {formatMode(route.mode)}
                  </span>
                  <span className="chip-row">
                    <span className="chip">rev {route.currentRevision?.revisionNumber ?? '—'}</span>
                    {route.isPublic ? <span className="chip">public</span> : null}
                  </span>
                </button>
              ))}
              {routes.length === 0 && !isLoading ? <p className="muted">No routes yet.</p> : null}
            </div>
          </div>
        </aside>

        <section className="grid">
          <PlaceEditor
            key={selectedPlace?.id ?? 'new-place'}
            onDelete={selectedPlace == null ? undefined : () => void deletePlace(selectedPlace.id)}
            onSave={(input) => void savePlace(input)}
            place={selectedPlace}
          />
          <RouteEditor
            key={selectedRoute?.id ?? 'new-route'}
            onDelete={selectedRoute == null ? undefined : () => void deleteRoute(selectedRoute.id)}
            onSave={(input) => void saveRoute(input)}
            route={selectedRoute}
          />
        </section>
      </section>
    </main>
  );
}

function PlaceEditor({
  onDelete,
  onSave,
  place,
}: {
  onDelete?: () => void;
  onSave: (input: PlaceInput) => void;
  place: Place | null;
}) {
  const [name, setName] = useState(place?.name ?? '');
  const [latitude, setLatitude] = useState(place?.latitude.toString() ?? '25.033');
  const [longitude, setLongitude] = useState(place?.longitude.toString() ?? '121.5654');
  const [description, setDescription] = useState(place?.description ?? '');
  const [tags, setTags] = useState(place?.tags.join(', ') ?? '');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSaving(true);

    try {
      await onSave({
        description: normalizeNullable(description),
        latitude: parseNumber(latitude, 'latitude'),
        longitude: parseNumber(longitude, 'longitude'),
        name,
        tags: tags.split(',').map((tag) => tag.trim()).filter(Boolean),
      });
    } catch (nextError) {
      setError(formatError(nextError));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form className="panel stack" onSubmit={submit}>
      <h2>{place == null ? 'New place' : 'Edit place'}</h2>
      {error == null ? null : <div className="error">{error}</div>}
      <label>
        Name
        <input required value={name} onChange={(event) => setName(event.target.value)} />
      </label>
      <div className="split">
        <label>
          Latitude
          <input required inputMode="decimal" value={latitude} onChange={(event) => setLatitude(event.target.value)} />
        </label>
        <label>
          Longitude
          <input required inputMode="decimal" value={longitude} onChange={(event) => setLongitude(event.target.value)} />
        </label>
      </div>
      <label>
        Tags (comma separated)
        <input value={tags} onChange={(event) => setTags(event.target.value)} />
      </label>
      <label>
        Description
        <textarea value={description} onChange={(event) => setDescription(event.target.value)} />
      </label>
      <div className="row">
        <button disabled={isSaving} type="submit">{isSaving ? 'Saving…' : 'Save place'}</button>
        {onDelete == null ? null : (
          <button className="danger" disabled={isSaving} type="button" onClick={onDelete}>Delete</button>
        )}
      </div>
    </form>
  );
}

function RouteEditor({
  onDelete,
  onSave,
  route,
}: {
  onDelete?: () => void;
  onSave: (input: RouteInput) => void;
  route: Route | null;
}) {
  const [name, setName] = useState(route?.name ?? '');
  const [description, setDescription] = useState(route?.description ?? '');
  const [defaultSpeedKmh, setDefaultSpeedKmh] = useState(route?.defaultSpeedKmh.toString() ?? '5');
  const [mode, setMode] = useState<RouteMode>(route?.mode ?? 'ONCE');
  const [isPublic, setIsPublic] = useState(route?.isPublic ?? false);
  const [waypoints, setWaypoints] = useState<RouteWaypoint[]>(
    route?.currentRevision?.waypoints.map((waypoint) => ({
      latitude: waypoint.latitude,
      longitude: waypoint.longitude,
    })) ?? [
      { latitude: 25.033, longitude: 121.5654 },
      { latitude: 25.0375, longitude: 121.5637 },
    ],
  );
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSaving(true);

    try {
      await onSave({
        defaultSpeedKmh: parseNumber(defaultSpeedKmh, 'default speed'),
        description: normalizeNullable(description),
        isPublic,
        mode,
        name,
        waypoints: waypoints.map((waypoint) => ({
          latitude: waypoint.latitude,
          longitude: waypoint.longitude,
        })),
      });
    } catch (nextError) {
      setError(formatError(nextError));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form className="panel stack" onSubmit={submit}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2>{route == null ? 'New route' : 'Route editor'}</h2>
        {route?.currentRevision == null ? null : <span className="chip">latest revision {route.currentRevision.revisionNumber}</span>}
      </div>
      {error == null ? null : <div className="error">{error}</div>}
      <RouteMapEditor waypoints={waypoints} onChange={setWaypoints} />
      <label>
        Name
        <input required value={name} onChange={(event) => setName(event.target.value)} />
      </label>
      <div className="split">
        <label>
          Default speed (km/h)
          <input required inputMode="decimal" value={defaultSpeedKmh} onChange={(event) => setDefaultSpeedKmh(event.target.value)} />
        </label>
        <label>
          Playback mode
          <select value={mode} onChange={(event) => setMode(event.target.value as RouteMode)}>
            <option value="ONCE">Once</option>
            <option value="LOOP">Loop</option>
            <option value="PING_PONG">PingPong</option>
          </select>
        </label>
      </div>
      <label className="row">
        <input checked={isPublic} style={{ width: 'auto' }} type="checkbox" onChange={(event) => setIsPublic(event.target.checked)} />
        Public route
      </label>
      <label>
        Description
        <textarea value={description} onChange={(event) => setDescription(event.target.value)} />
      </label>

      <div className="stack">
        <h3>Waypoints</h3>
        {waypoints.map((waypoint, index) => (
          <div className="waypoint-row" key={`${index}-${waypoint.latitude}-${waypoint.longitude}`}>
            <span className="chip">#{index + 1}</span>
            <input
              inputMode="decimal"
              value={waypoint.latitude}
              onChange={(event) => updateWaypoint(waypoints, setWaypoints, index, 'latitude', event.target.value)}
            />
            <input
              inputMode="decimal"
              value={waypoint.longitude}
              onChange={(event) => updateWaypoint(waypoints, setWaypoints, index, 'longitude', event.target.value)}
            />
            <div className="row">
              <button className="secondary" disabled={index === 0} type="button" onClick={() => moveWaypoint(waypoints, setWaypoints, index, index - 1)}>↑</button>
              <button className="secondary" disabled={index === waypoints.length - 1} type="button" onClick={() => moveWaypoint(waypoints, setWaypoints, index, index + 1)}>↓</button>
              <button className="danger" disabled={waypoints.length <= 2} type="button" onClick={() => setWaypoints(waypoints.filter((_, currentIndex) => currentIndex !== index))}>×</button>
            </div>
          </div>
        ))}
        <button
          className="secondary"
          type="button"
          onClick={() => setWaypoints([...waypoints, waypoints.at(-1) ?? { latitude: 25.033, longitude: 121.5654 }])}
        >
          Add waypoint
        </button>
      </div>

      <div className="row">
        <button disabled={isSaving || waypoints.length < 2} type="submit">{isSaving ? 'Saving…' : 'Save route'}</button>
        {onDelete == null ? null : (
          <button className="danger" disabled={isSaving} type="button" onClick={onDelete}>Delete</button>
        )}
      </div>
    </form>
  );
}

function TagRow({ tags }: { tags: string[] }) {
  if (tags.length === 0) {
    return null;
  }

  return (
    <span className="chip-row">
      {tags.map((tag) => <span className="chip" key={tag}>{tag}</span>)}
    </span>
  );
}

function updateWaypoint(
  waypoints: RouteWaypoint[],
  setWaypoints: (waypoints: RouteWaypoint[]) => void,
  index: number,
  field: 'latitude' | 'longitude',
  value: string,
) {
  const parsedValue = Number(value);

  if (!Number.isFinite(parsedValue)) {
    return;
  }

  setWaypoints(
    waypoints.map((waypoint, currentIndex) =>
      currentIndex === index ? { ...waypoint, [field]: parsedValue } : waypoint,
    ),
  );
}

function moveWaypoint(
  waypoints: RouteWaypoint[],
  setWaypoints: (waypoints: RouteWaypoint[]) => void,
  fromIndex: number,
  toIndex: number,
) {
  const nextWaypoints = [...waypoints];
  const [waypoint] = nextWaypoints.splice(fromIndex, 1);
  nextWaypoints.splice(toIndex, 0, waypoint);
  setWaypoints(nextWaypoints);
}

function parseNumber(value: string, label: string): number {
  const parsedValue = Number(value);

  if (!Number.isFinite(parsedValue)) {
    throw new Error(`${label} must be a finite number`);
  }

  return parsedValue;
}

function normalizeNullable(value: string): string | null {
  const trimmed = value.trim();

  return trimmed.length === 0 ? null : trimmed;
}

function formatCoord(value: number): string {
  return value.toFixed(6);
}

function formatMode(mode: RouteMode): string {
  return mode === 'PING_PONG' ? 'PingPong' : mode[0] + mode.slice(1).toLowerCase();
}

function formatError(error: unknown): string {
  if (error instanceof ApiError || error instanceof Error) {
    return error.message;
  }

  return 'Unexpected error';
}
