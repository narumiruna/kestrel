'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  onSave,
  places = [],
  route,
}: {
  onDelete?: () => void;
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
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const saveNoticeTimeoutRef = useRef<number | null>(null);
  const routeBuilderHint = getRouteBuilderHint(waypoints.length, places.length);
  const saveDisabledReason = getSaveDisabledReason(waypoints.length);
  const favoritePickerMode = waypoints.length === 0 ? 'start' : 'append';

  useEffect(() => {
    if (selectedWaypointIndex != null && selectedWaypointIndex >= waypoints.length) {
      setSelectedWaypointIndex(null);
    }
  }, [selectedWaypointIndex, waypoints.length]);

  useEffect(
    () => () => {
      if (saveNoticeTimeoutRef.current != null) {
        window.clearTimeout(saveNoticeTimeoutRef.current);
      }
    },
    [],
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaveNotice(null);
    if (saveNoticeTimeoutRef.current != null) {
      window.clearTimeout(saveNoticeTimeoutRef.current);
    }
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
      setSaveNotice('Saved.');
      saveNoticeTimeoutRef.current = window.setTimeout(() => {
        setSaveNotice(null);
        saveNoticeTimeoutRef.current = null;
      }, 1000);
    } catch (nextError) {
      setError(formatError(nextError));
    } finally {
      setIsSaving(false);
    }
  }

  function addFavoriteWaypoint(place: Place) {
    const waypoint = {
      latitude: place.latitude,
      longitude: place.longitude,
    };
    const nextWaypoints = waypoints.length === 0 ? [waypoint] : [...waypoints, waypoint];

    setWaypoints(nextWaypoints);
    setFocusTarget(waypoint);
    setSelectedWaypointIndex(nextWaypoints.length - 1);
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
          <div className="breadcrumb">
            Routes / <span>{route?.name ?? 'New route'}</span>
          </div>
          <h2>{route == null ? 'New route' : route.name}</h2>
          {route?.currentRevision == null ? null : (
            <span className="chip rev-chip">
              latest revision {route.currentRevision.revisionNumber}
            </span>
          )}
        </div>
      </header>
      {error == null ? null : <div className="error route-editor-error">{error}</div>}

      <section className="route-editor-section route-editor-map-section">
        <div>
          <h3>Route editor</h3>
          <p className="muted">Drag, drop, refine. Your route, your pace.</p>
        </div>
        <div className="route-builder-hint">
          <InfoIcon />
          {routeBuilderHint}
        </div>
        <FavoriteWaypointPicker
          mode={favoritePickerMode}
          places={places}
          onSelect={addFavoriteWaypoint}
        />
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
            title="Auto-frame the map to show all waypoints"
            type="button"
            onClick={() => setFitRequest((currentRequest) => currentRequest + 1)}
          >
            Fit route
          </button>
          <span className="muted">
            Add from map click, then expand Waypoints for exact coordinates.
          </span>
        </div>

        <details className="route-editor-collapsible route-editor-waypoints-section">
          <summary>
            <span>{formatWaypointCount(waypoints.length)}</span>
            <span className="muted">{formatWaypointSummary(waypoints)}</span>
          </summary>
          <div className="route-editor-collapsible-content">
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
                <div className="row-actions">
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
              className="secondary button-icon-label"
              disabled={waypoints.length === 0}
              type="button"
              onClick={duplicateLastWaypoint}
            >
              <PlusIcon />
              Add waypoint
            </button>
          </div>
        </details>
      </section>

      <details
        className="route-editor-section route-editor-collapsible route-editor-details-section"
        open
      >
        <summary>
          <span>Route details</span>
          <span className="muted">Name, speed, and playback</span>
        </summary>
        <div className="route-editor-collapsible-content">
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
            Description (optional)
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>
        </div>
      </details>

      <details className="route-editor-section route-editor-collapsible route-editor-secondary-section route-editor-share-section">
        <summary>
          <span>Publishing / share</span>
          <span className="muted">Privacy and public link settings</span>
        </summary>
        <div className="route-editor-collapsible-content">
          <label className="row">
            <input
              checked={isPublic}
              className="inline-control"
              type="checkbox"
              onChange={(event) => setIsPublic(event.target.checked)}
            />
            Public route
          </label>
          <RouteSharePanel route={route} />
        </div>
      </details>

      <footer className="route-editor-footer">
        <div className="stack">
          {saveDisabledReason == null ? null : (
            <p className="muted no-margin">{saveDisabledReason}</p>
          )}
          <div className="row">
            {onDelete == null ? null : (
              <button className="danger" disabled={isSaving} type="button" onClick={confirmDelete}>
                Delete route
              </button>
            )}
            <button
              className={isSaving ? 'is-loading' : saveNotice == null ? '' : 'is-saved'}
              disabled={isSaving || saveDisabledReason != null}
              type="submit"
            >
              {isSaving ? 'Saving…' : saveNotice == null ? 'Save route' : 'Saved ✓'}
            </button>
          </div>
        </div>
      </footer>
    </form>
  );
}

function FavoriteWaypointPicker({
  mode,
  onSelect,
  places,
}: {
  mode: 'append' | 'start';
  onSelect: (place: Place) => void;
  places: Place[];
}) {
  const [query, setQuery] = useState('');
  const [copiedPlaceId, setCopiedPlaceId] = useState<string | null>(null);
  const copiedTimeoutRef = useRef<number | null>(null);
  const filteredPlaces = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (normalizedQuery.length === 0) {
      return places;
    }

    return places.filter((place) => {
      const haystack = [place.name, place.description ?? '', ...place.tags].join(' ').toLowerCase();

      return haystack.includes(normalizedQuery);
    });
  }, [places, query]);

  useEffect(
    () => () => {
      if (copiedTimeoutRef.current != null) {
        window.clearTimeout(copiedTimeoutRef.current);
      }
    },
    [],
  );

  async function copyFavoriteCoords(place: Place) {
    try {
      await navigator.clipboard.writeText(formatFavoritePlaceCoords(place));
      setCopiedPlaceId(place.id);
      if (copiedTimeoutRef.current != null) {
        window.clearTimeout(copiedTimeoutRef.current);
      }
      copiedTimeoutRef.current = window.setTimeout(() => {
        setCopiedPlaceId((currentPlaceId) => (currentPlaceId === place.id ? null : currentPlaceId));
        copiedTimeoutRef.current = null;
      }, 1400);
    } catch {
      setCopiedPlaceId(null);
    }
  }

  if (places.length === 0) {
    return (
      <div className="favorite-picker empty-state">
        <p className="muted">No favorite places yet.</p>
        <Link href="/dashboard/places">Create a favorite place first</Link>
      </div>
    );
  }

  return (
    <section className="favorite-picker stack">
      <div>
        <h3>{mode === 'start' ? 'Add from favorites' : 'Add from favorites'}</h3>
        <p className="muted">
          {mode === 'start'
            ? 'Pick a saved place as the first waypoint, or click the map to start manually.'
            : 'Append a saved place. Drag, or click to add.'}
        </p>
      </div>
      <label className="favorite-search">
        Search favorites
        <span className="favorite-search-box">
          <SearchIcon />
          <input
            placeholder="Search favorites..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <kbd>⌘K</kbd>
        </span>
      </label>
      <div className="favorite-place-list">
        {filteredPlaces.map((place) => (
          <div className="favorite-place-option" key={place.id}>
            <span className="favorite-place-main">
              <MapPinIcon />
              <strong>{place.name}</strong>
              <button
                className="favorite-add button-icon-label"
                type="button"
                onClick={() => onSelect(place)}
              >
                <PlusIcon />
                Add
              </button>
            </span>
            <button
              aria-label={`Copy coordinates for ${place.name}`}
              className="coordinate-copy muted mono"
              type="button"
              onClick={() => void copyFavoriteCoords(place)}
            >
              {formatFavoritePlaceCoords(place)}
              {copiedPlaceId === place.id ? (
                <span className="coordinate-copy-tooltip">copied</span>
              ) : null}
            </button>
            {place.tags.length === 0 ? null : (
              <span className="chip-row">
                {place.tags.map((tag) => (
                  <span className="chip" key={tag}>
                    {tag}
                  </span>
                ))}
              </span>
            )}
          </div>
        ))}
        {filteredPlaces.length === 0 ? <p className="muted">No favorite places match.</p> : null}
      </div>
    </section>
  );
}

function formatFavoritePlaceCoords(place: Place): string {
  return `${place.latitude.toFixed(6)}, ${place.longitude.toFixed(6)}`;
}

function getWaypointKey(waypoint: RouteWaypoint, index: number): string {
  return `${waypoint.sequence ?? index}-${waypoint.latitude}-${waypoint.longitude}`;
}

function formatWaypointCount(waypointCount: number): string {
  return `${waypointCount} waypoint${waypointCount === 1 ? '' : 's'}`;
}

function formatWaypointSummary(waypoints: RouteWaypoint[]): string {
  const firstWaypoint = waypoints[0];
  const lastWaypoint = waypoints.at(-1);

  if (firstWaypoint == null || lastWaypoint == null) {
    return 'Start by adding a point';
  }

  if (waypoints.length === 1) {
    return `Starts at ${formatShortCoord(firstWaypoint.latitude)}, ${formatShortCoord(
      firstWaypoint.longitude,
    )}`;
  }

  return `Start at ${formatShortCoord(firstWaypoint.latitude)}, end at ${formatShortCoord(
    lastWaypoint.latitude,
  )}`;
}

function formatShortCoord(value: number | string): string {
  return Number(value).toFixed(2);
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

  return 'Tap the map to add a waypoint, or drag any pin to nudge the path.';
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
      <p className="muted no-margin">Save this route before creating a public latest-route link.</p>
    );
  }

  return (
    <section className="stack">
      <div className="route-share-header">
        <h3>Share link</h3>
        {isLoading ? <span className="muted">Loading…</span> : null}
      </div>
      <p className="muted no-margin">
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

function InfoIcon() {
  return (
    <svg aria-hidden="true" className="lucide-icon" fill="none" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg aria-hidden="true" className="lucide-icon" fill="none" viewBox="0 0 24 24">
      <path d="m21 21-4.3-4.3" />
      <circle cx="11" cy="11" r="8" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg aria-hidden="true" className="lucide-icon" fill="none" viewBox="0 0 24 24">
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

function MapPinIcon() {
  return (
    <svg
      aria-hidden="true"
      className="lucide-icon favorite-place-icon"
      fill="none"
      viewBox="0 0 24 24"
    >
      <path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
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
