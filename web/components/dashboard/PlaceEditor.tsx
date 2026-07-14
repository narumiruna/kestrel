'use client';

import dynamic from 'next/dynamic';
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import {
  formatError,
  normalizeNullable,
  parseNumber,
  toAbsolutePublicUrl,
} from '@/components/dashboard/utils';
import { DEFAULT_MAP_CENTER } from '@/components/mapStyle';
import { ApiError, type Place, type PlaceInput, type PlaceShareLink } from '@/lib/api';

const PlaceMapEditor = dynamic(() => import('@/components/PlaceMapEditor'), {
  ssr: false,
});

export default function PlaceEditor({
  compactDetails = false,
  draftCoords,
  onCoordinatesChange,
  onDelete,
  onDirtyChange,
  onDiscard,
  onSave,
  place,
  showHeader = true,
  showMap = true,
}: {
  compactDetails?: boolean;
  draftCoords?: { latitude: number; longitude: number };
  onCoordinatesChange?: (coords: { latitude: number; longitude: number }) => void;
  onDelete?: () => void;
  onDirtyChange?: (isDirty: boolean) => void;
  onDiscard?: (coords: { latitude: number; longitude: number }) => void;
  onSave: (input: PlaceInput) => void;
  place: Place | null;
  showHeader?: boolean;
  showMap?: boolean;
}) {
  const [name, setName] = useState(place?.name ?? '');
  const [latitude, setLatitude] = useState(() =>
    formatCoordinateInput(place?.latitude ?? draftCoords?.latitude ?? DEFAULT_MAP_CENTER.latitude),
  );
  const [longitude, setLongitude] = useState(() =>
    formatCoordinateInput(
      place?.longitude ?? draftCoords?.longitude ?? DEFAULT_MAP_CENTER.longitude,
    ),
  );
  const [description, setDescription] = useState(place?.description ?? '');
  const [tags, setTags] = useState(place?.tags.join(', ') ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const shareDialogRef = useRef<HTMLDialogElement | null>(null);
  const saveNoticeTimeoutRef = useRef<number | null>(null);
  const lastEmittedCoordsRef = useRef<{ latitude: number; longitude: number } | null>(null);
  const onDirtyChangeRef = useRef(onDirtyChange);
  const [newPlaceBaselineCoords] = useState(() => ({
    latitude: draftCoords?.latitude ?? DEFAULT_MAP_CENTER.latitude,
    longitude: draftCoords?.longitude ?? DEFAULT_MAP_CENTER.longitude,
  }));
  const baselineCoords = useMemo(
    () =>
      place == null
        ? newPlaceBaselineCoords
        : { latitude: place.latitude, longitude: place.longitude },
    [newPlaceBaselineCoords, place],
  );

  const baseline = useMemo(() => getPlaceBaseline(place, baselineCoords), [baselineCoords, place]);
  const mapCoords = useMemo(
    () => ({
      latitude: parseCoordinateOrFallback(
        latitude,
        place?.latitude ?? draftCoords?.latitude ?? DEFAULT_MAP_CENTER.latitude,
      ),
      longitude: parseCoordinateOrFallback(
        longitude,
        place?.longitude ?? draftCoords?.longitude ?? DEFAULT_MAP_CENTER.longitude,
      ),
    }),
    [draftCoords, latitude, longitude, place],
  );
  const isDirty = !isPlaceDraftEqual(
    {
      description,
      latitude,
      longitude,
      name,
      tags,
    },
    baseline,
  );

  useEffect(() => {
    if (draftCoords == null) {
      return;
    }

    const lastEmittedCoords = lastEmittedCoordsRef.current;
    if (
      lastEmittedCoords?.latitude === draftCoords.latitude &&
      lastEmittedCoords.longitude === draftCoords.longitude
    ) {
      lastEmittedCoordsRef.current = null;
      return;
    }

    setLatitude(formatCoordinateInput(draftCoords.latitude));
    setLongitude(formatCoordinateInput(draftCoords.longitude));
  }, [draftCoords]);

  useEffect(() => {
    onDirtyChangeRef.current = onDirtyChange;
  }, [onDirtyChange]);

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  useEffect(() => () => onDirtyChangeRef.current?.(false), []);

  useEffect(
    () => () => {
      if (saveNoticeTimeoutRef.current != null) {
        window.clearTimeout(saveNoticeTimeoutRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    const dialog = shareDialogRef.current;

    if (dialog == null) {
      return;
    }

    if (isShareDialogOpen && !dialog.open) {
      dialog.showModal();
      return;
    }

    if (!isShareDialogOpen && dialog.open) {
      dialog.close();
    }
  }, [isShareDialogOpen]);

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
        description: normalizeNullable(description),
        latitude: parseNumber(latitude, 'latitude'),
        longitude: parseNumber(longitude, 'longitude'),
        name,
        tags: tags
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean),
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

  function discardChanges() {
    setName(baseline.name);
    setLatitude(baseline.latitude);
    setLongitude(baseline.longitude);
    setDescription(baseline.description);
    setTags(baseline.tags);
    setError(null);
    setSaveNotice(null);
    onDiscard?.(baselineCoords);
  }

  function confirmDelete() {
    if (window.confirm('Delete this place? This cannot be undone.')) {
      onDelete?.();
    }
  }

  function updateCoordinate(axis: 'latitude' | 'longitude', value: string) {
    if (axis === 'latitude') {
      setLatitude(value);
    } else {
      setLongitude(value);
    }

    const nextLatitude = Number(axis === 'latitude' ? value : latitude);
    const nextLongitude = Number(axis === 'longitude' ? value : longitude);
    if (Number.isFinite(nextLatitude) && Number.isFinite(nextLongitude)) {
      const coords = { latitude: nextLatitude, longitude: nextLongitude };
      lastEmittedCoordsRef.current = coords;
      onCoordinatesChange?.(coords);
    }
  }

  return (
    <form
      className={`${showMap ? 'panel ' : ''}stack place-editor${showMap ? '' : ' place-editor-embedded'}${compactDetails ? ' place-editor-compact' : ''}`}
      onSubmit={submit}
    >
      {showHeader ? (
        <header className="place-editor-header">
          <div className="breadcrumb">
            Places / <span>{place?.name ?? 'New place'}</span>
          </div>
          <h2>{place == null ? 'New place' : place.name}</h2>
        </header>
      ) : null}
      <div className="place-editor-content stack">
        {error == null ? null : (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        {saveNotice == null ? null : (
          <div className="success" role="status">
            {saveNotice}
          </div>
        )}
        {showMap ? (
          <PlaceMapEditor
            latitude={mapCoords.latitude}
            longitude={mapCoords.longitude}
            onChange={(coords) => {
              setLatitude(formatCoordinateInput(coords.latitude));
              setLongitude(formatCoordinateInput(coords.longitude));
              lastEmittedCoordsRef.current = coords;
              onCoordinatesChange?.(coords);
            }}
          />
        ) : null}
        <label>
          Name
          <input required value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <div className="split">
          <label>
            Latitude
            <input
              required
              inputMode="decimal"
              value={latitude}
              onChange={(event) => updateCoordinate('latitude', event.target.value)}
            />
          </label>
          <label>
            Longitude
            <input
              required
              inputMode="decimal"
              value={longitude}
              onChange={(event) => updateCoordinate('longitude', event.target.value)}
            />
          </label>
        </div>
        {compactDetails ? (
          <details className="editor-more-details">
            <summary>More details</summary>
            <div className="stack">
              <label>
                Tags (comma separated)
                <input value={tags} onChange={(event) => setTags(event.target.value)} />
              </label>
              <label>
                Description
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                />
              </label>
            </div>
          </details>
        ) : (
          <>
            <label>
              Tags (comma separated)
              <input value={tags} onChange={(event) => setTags(event.target.value)} />
            </label>
            <label>
              Description
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </label>
          </>
        )}
      </div>
      <footer className="route-editor-footer place-editor-footer">
        <div className="place-editor-footer-actions">
          <div className="place-editor-danger-actions">
            {onDelete == null ? null : (
              <button className="danger" disabled={isSaving} type="button" onClick={confirmDelete}>
                Delete
              </button>
            )}
          </div>
          <div className="place-editor-save-actions">
            {isDirty ? <span className="unsaved-changes-label">Unsaved changes</span> : null}
            {isDirty ? (
              <button
                className="secondary"
                disabled={isSaving}
                type="button"
                onClick={discardChanges}
              >
                Discard changes
              </button>
            ) : null}
            {place == null ? null : (
              <button
                aria-haspopup="dialog"
                className="secondary"
                type="button"
                onClick={() => setIsShareDialogOpen(true)}
              >
                Share
              </button>
            )}
            <button disabled={isSaving} type="submit">
              {isSaving ? 'Saving…' : saveNotice == null ? 'Save place' : 'Saved ✓'}
            </button>
          </div>
        </div>
        <dialog
          aria-labelledby="place-share-dialog-title"
          className="place-action-dialog"
          ref={shareDialogRef}
          onCancel={() => setIsShareDialogOpen(false)}
          onClose={() => setIsShareDialogOpen(false)}
        >
          <div className="place-action-dialog-card">
            <header>
              <div>
                <p className="field-kicker font-mono">secondary action</p>
                <h3 className="font-serif" id="place-share-dialog-title">
                  Share place
                </h3>
              </div>
              <button
                className="secondary"
                type="button"
                onClick={() => setIsShareDialogOpen(false)}
              >
                Close
              </button>
            </header>
            <PlaceSharePanel place={place} />
          </div>
        </dialog>
      </footer>
    </form>
  );
}

function getPlaceBaseline(
  place: Place | null,
  draftCoords: { latitude: number; longitude: number },
) {
  return {
    description: place?.description ?? '',
    latitude: formatCoordinateInput(place?.latitude ?? draftCoords.latitude),
    longitude: formatCoordinateInput(place?.longitude ?? draftCoords.longitude),
    name: place?.name ?? '',
    tags: place?.tags.join(', ') ?? '',
  };
}

function isPlaceDraftEqual(
  draft: {
    description: string;
    latitude: string;
    longitude: string;
    name: string;
    tags: string;
  },
  baseline: ReturnType<typeof getPlaceBaseline>,
): boolean {
  return (
    normalizeNullable(draft.description) === normalizeNullable(baseline.description) &&
    numberInputsEqual(draft.latitude, baseline.latitude) &&
    numberInputsEqual(draft.longitude, baseline.longitude) &&
    draft.name.trim() === baseline.name.trim() &&
    normalizeTagsInput(draft.tags) === normalizeTagsInput(baseline.tags)
  );
}

function numberInputsEqual(left: string, right: string): boolean {
  const leftNumber = Number(left);
  const rightNumber = Number(right);

  return Number.isFinite(leftNumber) && Number.isFinite(rightNumber) && leftNumber === rightNumber;
}

function normalizeTagsInput(value: string): string {
  return value
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)
    .join('\n');
}

function PlaceSharePanel({ place }: { place: Place | null }) {
  const auth = useAuth();
  const [shareLink, setShareLink] = useState<PlaceShareLink | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isMutating, setIsMutating] = useState(false);

  const loadShareLink = useCallback(async () => {
    if (place == null) {
      setShareLink(null);
      setError(null);
      return;
    }

    setError(null);
    setIsLoading(true);

    try {
      const nextShareLink = await auth.apiRequest<PlaceShareLink>(`/places/${place.id}/share-link`);
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
  }, [auth, place]);

  useEffect(() => {
    setNotice(null);
    void loadShareLink();
  }, [loadShareLink]);

  async function createShareLink() {
    if (place == null) {
      return;
    }

    setNotice(null);
    setError(null);
    setIsMutating(true);

    try {
      const nextShareLink = await auth.apiRequest<PlaceShareLink>(
        `/places/${place.id}/share-link`,
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
    if (place == null) {
      return;
    }

    setNotice(null);
    setError(null);
    setIsMutating(true);

    try {
      const nextShareLink = await auth.apiRequest<PlaceShareLink>(
        `/places/${place.id}/share-link`,
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

  if (place == null) {
    return <p className="muted no-margin">Save this place before creating a public place link.</p>;
  }

  return (
    <section className="stack">
      <div className="route-share-header">
        <h3>Share link</h3>
        {isLoading ? <span className="muted">Loading…</span> : null}
      </div>
      <p className="muted no-margin">
        Visitors can open the public page without login. Signed-in users can copy this place into
        their own library.
      </p>
      <p className="muted no-margin">
        Public link:{' '}
        {shareLink == null ? 'Not created' : shareLink.disabledAt == null ? 'Active' : 'Disabled'}
      </p>
      {error == null ? null : (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      {notice == null ? null : (
        <div className="success" role="status">
          {notice}
        </div>
      )}
      {shareLink == null ? (
        <div className="row">
          <button
            className="secondary"
            disabled={isMutating}
            type="button"
            onClick={() => void createShareLink()}
          >
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
            <span className="chip">place</span>
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

function parseCoordinateOrFallback(value: string, fallback: number): number {
  const parsedValue = Number(value);

  return Number.isFinite(parsedValue) ? parsedValue : fallback;
}

function formatCoordinateInput(value: number): string {
  return value.toFixed(6);
}
