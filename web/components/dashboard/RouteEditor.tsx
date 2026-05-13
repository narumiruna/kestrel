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
        {route?.currentRevision == null ? null : (
          <span className="chip">latest revision {route.currentRevision.revisionNumber}</span>
        )}
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
      <label className="row">
        <input
          checked={isPublic}
          style={{ width: 'auto' }}
          type="checkbox"
          onChange={(event) => setIsPublic(event.target.checked)}
        />
        Public route
      </label>
      <label>
        Description
        <textarea value={description} onChange={(event) => setDescription(event.target.value)} />
      </label>
      <RouteSharePanel route={route} />

      <div className="stack">
        <h3>Waypoints</h3>
        {waypoints.map((waypoint, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: waypoint rows are edited by position until drag-and-drop adds stable row ids.
          <div className="waypoint-row" key={`${index}-${waypoint.latitude}-${waypoint.longitude}`}>
            <span className="chip">#{index + 1}</span>
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
              <button
                className="danger"
                disabled={waypoints.length <= 2}
                type="button"
                onClick={() =>
                  setWaypoints(waypoints.filter((_, currentIndex) => currentIndex !== index))
                }
              >
                ×
              </button>
            </div>
          </div>
        ))}
        <button
          className="secondary"
          type="button"
          onClick={() =>
            setWaypoints([
              ...waypoints,
              waypoints.at(-1) ?? { latitude: 25.033, longitude: 121.5654 },
            ])
          }
        >
          Add waypoint
        </button>
      </div>

      <div className="row">
        <button disabled={isSaving || waypoints.length < 2} type="submit">
          {isSaving ? 'Saving…' : 'Save route'}
        </button>
        {onDelete == null ? null : (
          <button className="danger" disabled={isSaving} type="button" onClick={onDelete}>
            Delete
          </button>
        )}
      </div>
    </form>
  );
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

  return (
    <section
      className="stack"
      style={{ borderTop: '1px solid var(--color-border)', paddingTop: '0.75rem' }}
    >
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h3 style={{ margin: 0 }}>Share link</h3>
        {isLoading ? <span className="muted">Loading…</span> : null}
      </div>
      {route == null ? (
        <p className="muted" style={{ margin: 0 }}>
          Save this route before creating a public latest-route link.
        </p>
      ) : (
        <>
          <p className="muted" style={{ margin: 0 }}>
            Visitors can open the public page without login. Signed-in users can copy the visible
            route snapshot into their own library.
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
        </>
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
