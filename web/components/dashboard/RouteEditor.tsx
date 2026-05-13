'use client';

import dynamic from 'next/dynamic';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import {
  formatError,
  normalizeNullable,
  parseNumber,
  toAbsolutePublicUrl,
} from '@/components/dashboard/utils';
import {
  ApiError,
  type Place,
  type Route,
  type RouteInput,
  type RouteMode,
  type RouteShareLink,
  type RouteWaypoint,
} from '@/lib/api';

const RouteMapEditor = dynamic(() => import('@/components/RouteMapEditor'), {
  ssr: false,
});

export default function RouteEditor({
  onDelete,
  onNew,
  onSave,
  places = [],
  route,
}: {
  onDelete?: () => void;
  onNew?: () => void;
  onSave: (input: RouteInput) => void;
  places?: Place[];
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
    })) ?? [],
  );
  const [fitRequest, setFitRequest] = useState(0);
  const [focusTarget, setFocusTarget] = useState<RouteWaypoint | null>(null);
  const [selectedWaypointIndex, setSelectedWaypointIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const routeBuilderHint = getRouteBuilderHint(waypoints.length, places.length);
  const saveDisabledReason = getSaveDisabledReason(waypoints.length);

  useEffect(() => {
    if (selectedWaypointIndex != null && selectedWaypointIndex >= waypoints.length) {
      setSelectedWaypointIndex(null);
    }
  }, [selectedWaypointIndex, waypoints.length]);

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

  function startFromPlace(placeId: string) {
    const place = places.find((currentPlace) => currentPlace.id === placeId);

    if (place == null) {
      return;
    }

    const waypoint = {
      latitude: place.latitude,
      longitude: place.longitude,
    };

    setWaypoints([waypoint]);
    setFocusTarget(waypoint);
    setSelectedWaypointIndex(0);
  }

  function duplicateLastWaypoint() {
    const lastWaypoint = waypoints.at(-1);

    if (lastWaypoint == null) {
      return;
    }

    setWaypoints([...waypoints, lastWaypoint]);
    setSelectedWaypointIndex(waypoints.length);
  }

  function removeWaypoint(index: number) {
    setWaypoints(waypoints.filter((_, currentIndex) => currentIndex !== index));
    setSelectedWaypointIndex((currentIndex) => {
      if (currentIndex == null || currentIndex === index) {
        return null;
      }

      return currentIndex > index ? currentIndex - 1 : currentIndex;
    });
  }

  function confirmDelete() {
    if (window.confirm('Delete this route? This cannot be undone.')) {
      onDelete?.();
    }
  }

  return (
    <form className="panel route-editor" onSubmit={submit}>
      <header className="route-editor-header">
        <div className="stack">
          <h2>{route == null ? 'New route' : 'Route editor'}</h2>
          {route?.currentRevision == null ? null : (
            <span className="chip">latest revision {route.currentRevision.revisionNumber}</span>
          )}
        </div>
        {onNew == null ? null : (
          <button className="secondary" type="button" onClick={onNew}>
            New route
          </button>
        )}
      </header>
      {error == null ? null : <div className="error">{error}</div>}

      <section className="route-editor-section">
        <div>
          <h3>Map builder</h3>
          <p className="muted">Build the route shape from favorites or direct map clicks.</p>
        </div>
        <div className="route-builder-hint">{routeBuilderHint}</div>
        {route == null && waypoints.length === 0 && places.length > 0 ? (
          <label>
            Start from favorite place
            <select defaultValue="" onChange={(event) => startFromPlace(event.target.value)}>
              <option disabled value="">
                Select a saved place…
              </option>
              {places.map((place) => (
                <option key={place.id} value={place.id}>
                  {place.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <div className="map-builder">
          <RouteMapEditor
            fitRequest={fitRequest}
            focusTarget={focusTarget}
            selectedWaypointIndex={selectedWaypointIndex}
            waypoints={waypoints}
            onChange={setWaypoints}
            onSelectWaypoint={setSelectedWaypointIndex}
          />
          <div className="map-instruction">Click map to add waypoint · Drag markers to adjust</div>
        </div>
        <div className="map-action-row">
          <button
            className="secondary"
            disabled={waypoints.length === 0}
            type="button"
            onClick={() => setFitRequest((currentRequest) => currentRequest + 1)}
          >
            Fit route
          </button>
          <span className="muted">Add from map click, then use rows for exact coordinates.</span>
        </div>

        <div className="stack">
          <h3>Waypoints</h3>
          {waypoints.map((waypoint, index) => (
            <div
              className={`waypoint-row ${selectedWaypointIndex === index ? 'selected' : ''}`}
              key={getWaypointKey(waypoint, index)}
              onPointerDown={() => setSelectedWaypointIndex(index)}
            >
              <span className="chip">{getWaypointLabel(index, waypoints.length)}</span>
              <input
                inputMode="decimal"
                value={waypoint.latitude}
                onChange={(event) =>
                  updateWaypoint(waypoints, setWaypoints, index, 'latitude', event.target.value)
                }
              />
              <input
                inputMode="decimal"
                value={waypoint.longitude}
                onChange={(event) =>
                  updateWaypoint(waypoints, setWaypoints, index, 'longitude', event.target.value)
                }
              />
              <div className="row">
                <button
                  className="secondary"
                  disabled={index === 0}
                  type="button"
                  onClick={() => moveWaypoint(waypoints, setWaypoints, index, index - 1)}
                >
                  ↑
                </button>
                <button
                  className="secondary"
                  disabled={index === waypoints.length - 1}
                  type="button"
                  onClick={() => moveWaypoint(waypoints, setWaypoints, index, index + 1)}
                >
                  ↓
                </button>
                <button className="danger" type="button" onClick={() => removeWaypoint(index)}>
                  ×
                </button>
              </div>
            </div>
          ))}
          <button
            className="secondary"
            disabled={waypoints.length === 0}
            type="button"
            onClick={duplicateLastWaypoint}
          >
            Duplicate last waypoint
          </button>
        </div>
      </section>

      <section className="route-editor-section">
        <div>
          <h3>Route details</h3>
          <p className="muted">Name the route and set how it should play back.</p>
        </div>
        <label className="route-title-field">
          Name
          <input required value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <div className="split">
          <label>
            Default speed (km/h)
            <input
              required
              inputMode="decimal"
              value={defaultSpeedKmh}
              onChange={(event) => setDefaultSpeedKmh(event.target.value)}
            />
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
        <label>
          Description
          <textarea value={description} onChange={(event) => setDescription(event.target.value)} />
        </label>
      </section>

      <section className="route-editor-section route-editor-secondary-section">
        <div>
          <h3>Publishing / share</h3>
          <p className="muted">Keep the route private, or create a public link after saving.</p>
        </div>
        <label className="row">
          <input
            checked={isPublic}
            style={{ width: 'auto' }}
            type="checkbox"
            onChange={(event) => setIsPublic(event.target.checked)}
          />
          Public route
        </label>
        <RouteSharePanel route={route} />
      </section>

      <footer className="route-editor-footer">
        <div className="stack">
          {saveDisabledReason == null ? null : (
            <p className="muted" style={{ margin: 0 }}>
              {saveDisabledReason}
            </p>
          )}
          <div className="row">
            <button disabled={isSaving || saveDisabledReason != null} type="submit">
              {isSaving ? 'Saving…' : 'Save route'}
            </button>
            {onDelete == null ? null : (
              <button className="danger" disabled={isSaving} type="button" onClick={confirmDelete}>
                Delete route
              </button>
            )}
          </div>
        </div>
      </footer>
    </form>
  );
}

function getWaypointKey(waypoint: RouteWaypoint, index: number): string {
  return `${waypoint.sequence ?? index}-${waypoint.latitude}-${waypoint.longitude}`;
}

function getWaypointLabel(index: number, waypointCount: number): string {
  if (index === 0) {
    return 'Start';
  }

  if (index === waypointCount - 1) {
    return 'End';
  }

  return `Stop ${index + 1}`;
}

function getRouteBuilderHint(waypointCount: number, placeCount: number): string {
  if (waypointCount === 0) {
    return placeCount === 0
      ? 'Start by clicking the map to add your first waypoint.'
      : 'Choose a favorite place as the start, or click the map to add your first waypoint.';
  }

  if (waypointCount === 1) {
    return 'Add at least one more waypoint to save this route.';
  }

  return 'Add more waypoints from the map, or drag markers to refine the route.';
}

function getSaveDisabledReason(waypointCount: number): string | null {
  if (waypointCount === 0) {
    return 'Add at least 2 waypoints before saving.';
  }

  if (waypointCount === 1) {
    return 'Add 1 more waypoint before saving.';
  }

  return null;
}

function RouteSharePanel({ route }: { route: Route | null }) {
  const auth = useAuth();
  const [shareLink, setShareLink] = useState<RouteShareLink | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isMutating, setIsMutating] = useState(false);

  const loadShareLink = useCallback(async () => {
    if (route == null) {
      setShareLink(null);
      setError(null);
      return;
    }

    setError(null);
    setIsLoading(true);

    try {
      const nextShareLink = await auth.apiRequest<RouteShareLink>(`/routes/${route.id}/share-link`);
      setShareLink(nextShareLink);
    } catch (nextError) {
      if (nextError instanceof ApiError && nextError.status === 404) {
        setShareLink(null);
        return;
      }

      setError(formatError(nextError));
    } finally {
      setIsLoading(false);
    }
  }, [auth, route]);

  useEffect(() => {
    setNotice(null);
    void loadShareLink();
  }, [loadShareLink]);

  async function createShareLink() {
    if (route == null) {
      return;
    }

    setNotice(null);
    setError(null);
    setIsMutating(true);

    try {
      const nextShareLink = await auth.apiRequest<RouteShareLink>(
        `/routes/${route.id}/share-link`,
        {
          method: 'POST',
        },
      );
      setShareLink(nextShareLink);
    } catch (nextError) {
      setError(formatError(nextError));
    } finally {
      setIsMutating(false);
    }
  }

  async function setDisabled(disabled: boolean) {
    if (route == null) {
      return;
    }

    setNotice(null);
    setError(null);
    setIsMutating(true);

    try {
      const nextShareLink = await auth.apiRequest<RouteShareLink>(
        `/routes/${route.id}/share-link`,
        {
          body: JSON.stringify({ disabled }),
          method: 'PATCH',
        },
      );
      setShareLink(nextShareLink);
    } catch (nextError) {
      setError(formatError(nextError));
    } finally {
      setIsMutating(false);
    }
  }

  async function copyPublicUrl() {
    if (shareLink == null) {
      return;
    }

    try {
      await navigator.clipboard.writeText(toAbsolutePublicUrl(shareLink.publicUrl));
      setNotice('Share URL copied.');
    } catch {
      setNotice('Copy failed; select the URL manually.');
    }
  }

  if (route == null) {
    return (
      <p className="muted" style={{ margin: 0 }}>
        Save this route before creating a public latest-route link.
      </p>
    );
  }

  return (
    <section className="stack">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h3 style={{ margin: 0 }}>Share link</h3>
        {isLoading ? <span className="muted">Loading…</span> : null}
      </div>
      <p className="muted" style={{ margin: 0 }}>
        Visitors can open the public page without login. Signed-in users can copy the visible route
        snapshot into their own library.
      </p>
      {error == null ? null : <div className="error">{error}</div>}
      {notice == null ? null : <div className="success">{notice}</div>}
      {shareLink == null ? (
        <div className="row">
          <button disabled={isMutating} type="button" onClick={() => void createShareLink()}>
            {isMutating ? 'Creating…' : 'Create public link'}
          </button>
        </div>
      ) : (
        <div className="stack">
          <label>
            Public URL
            <input readOnly value={toAbsolutePublicUrl(shareLink.publicUrl)} />
          </label>
          <div className="chip-row">
            {shareLink.disabledAt == null ? (
              <span className="chip">active</span>
            ) : (
              <span className="chip">disabled</span>
            )}
            <span className="chip">latest route</span>
          </div>
          <div className="row">
            <button className="secondary" type="button" onClick={() => void copyPublicUrl()}>
              Copy URL
            </button>
            <a href={shareLink.publicUrl} rel="noreferrer" target="_blank">
              Open public page
            </a>
            <button
              className={shareLink.disabledAt == null ? 'danger' : 'secondary'}
              disabled={isMutating}
              type="button"
              onClick={() => void setDisabled(shareLink.disabledAt == null)}
            >
              {isMutating
                ? 'Saving…'
                : shareLink.disabledAt == null
                  ? 'Disable link'
                  : 'Re-enable link'}
            </button>
          </div>
        </div>
      )}
    </section>
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
