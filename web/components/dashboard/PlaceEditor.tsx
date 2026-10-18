'use client';

import { useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useShareLink } from '@/components/dashboard/useShareLink';
import { normalizeNullable, parseNumber, toAbsolutePublicUrl } from '@/components/dashboard/utils';
import { DEFAULT_MAP_CENTER } from '@/components/mapStyle';
import { Button, DialogFrame, Disclosure, TextArea, TextInput } from '@/components/ui/radix-ui';
import { errorMessage } from '@/i18n/errors';
import type { Place, PlaceInput } from '@/lib/api';

export default function PlaceEditor({
  draftCoords,
  onCoordinatesChange,
  onDirtyChange,
  onDiscard,
  onSave,
  place,
}: {
  draftCoords?: { latitude: number; longitude: number };
  onCoordinatesChange?: (coords: { latitude: number; longitude: number }) => void;
  onDirtyChange?: (isDirty: boolean) => void;
  onDiscard?: (coords: { latitude: number; longitude: number }) => void;
  onSave: (input: PlaceInput) => void;
  place: Place | null;
}) {
  const t = useTranslations('PlaceEditor');
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
  const te = useTranslations('Errors');
  const [error, setError] = useState<unknown>(null);
  const [saveNotice, setSaveNotice] = useState<'savedNotice' | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
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
      setSaveNotice('savedNotice');
      saveNoticeTimeoutRef.current = window.setTimeout(() => {
        setSaveNotice(null);
        saveNoticeTimeoutRef.current = null;
      }, 1000);
    } catch (nextError) {
      setError(nextError);
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
      className="stack place-editor place-editor-embedded place-editor-compact"
      onSubmit={submit}
    >
      <div className="place-editor-content stack">
        {error == null ? null : (
          <div className="error" role="alert">
            {errorMessage(error, te)}
          </div>
        )}
        {saveNotice == null ? null : (
          <div className="success" role="status">
            {t(saveNotice)}
          </div>
        )}
        <label htmlFor="radix-field-components-dashboard-placeeditor-tsx-1">
          {t('name')}
          <TextInput
            id="radix-field-components-dashboard-placeeditor-tsx-1"
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <div className="split">
          <label htmlFor="radix-field-components-dashboard-placeeditor-tsx-2">
            {t('latitude')}
            <TextInput
              id="radix-field-components-dashboard-placeeditor-tsx-2"
              required
              inputMode="decimal"
              value={latitude}
              onChange={(event) => updateCoordinate('latitude', event.target.value)}
            />
          </label>
          <label htmlFor="radix-field-components-dashboard-placeeditor-tsx-3">
            {t('longitude')}
            <TextInput
              id="radix-field-components-dashboard-placeeditor-tsx-3"
              required
              inputMode="decimal"
              value={longitude}
              onChange={(event) => updateCoordinate('longitude', event.target.value)}
            />
          </label>
        </div>
        <p className="muted">{t('coordinateHelp')}</p>
        <Disclosure className="editor-more-details" summary={t('moreDetails')}>
          <div className="stack">
            <label htmlFor="radix-field-components-dashboard-placeeditor-tsx-4">
              {t('tagsCommaSeparated')}
              <TextInput
                id="radix-field-components-dashboard-placeeditor-tsx-4"
                value={tags}
                onChange={(event) => setTags(event.target.value)}
              />
            </label>
            <label htmlFor="radix-field-components-dashboard-placeeditor-tsx-5">
              {t('description')}
              <TextArea
                id="radix-field-components-dashboard-placeeditor-tsx-5"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </label>
          </div>
        </Disclosure>
      </div>
      <footer className="route-editor-footer place-editor-footer">
        <div className="place-editor-footer-actions">
          <div className="place-editor-danger-actions"></div>
          <div className="place-editor-save-actions">
            {isDirty ? <span className="unsaved-changes-label">{t('unsavedChanges')}</span> : null}
            {isDirty ? (
              <Button
                className="secondary"
                disabled={isSaving}
                type="button"
                onClick={discardChanges}
              >
                {t('discardChanges')}
              </Button>
            ) : null}
            {place == null ? null : (
              <DialogFrame
                className="place-action-dialog-card"
                eyebrow={t('secondaryAction')}
                open={isShareDialogOpen}
                title={t('sharePlace')}
                trigger={
                  <Button className="secondary" type="button">
                    {t('share')}
                  </Button>
                }
                onOpenChange={setIsShareDialogOpen}
              >
                <PlaceSharePanel place={place} />
              </DialogFrame>
            )}
            <Button disabled={isSaving} type="submit">
              {isSaving ? t('saving') : saveNotice == null ? t('savePlace') : t('saved')}
            </Button>
          </div>
        </div>
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
  const t = useTranslations('PlaceEditor');
  const { createShareLink, error, isLoading, isMutating, loadShareLink, setDisabled, shareLink } =
    useShareLink('places', place?.id ?? null);
  const [notice, setNotice] = useState<'copied' | 'copyFailed' | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: Reload for refreshed saved objects, even when their ID is unchanged.
  useEffect(() => {
    setNotice(null);
    void loadShareLink();
  }, [loadShareLink, place]);

  async function copyPublicUrl() {
    if (shareLink == null) {
      return;
    }

    try {
      await navigator.clipboard.writeText(toAbsolutePublicUrl(shareLink.publicUrl));
      setNotice('copied');
    } catch {
      setNotice('copyFailed');
    }
  }

  if (place == null) {
    return <p className="muted no-margin">{t('saveThisPlaceBeforeCreatingAPublicPlaceLink')}</p>;
  }

  return (
    <section className="stack">
      <div className="route-share-header">
        <h3>{t('shareLink')}</h3>
        {isLoading ? <span className="muted">{t('loading')}</span> : null}
      </div>
      <p className="muted no-margin">{t('visitorsCanOpenThePublicPageWithoutLoginSignedIn')}</p>
      <p className="muted no-margin">
        {t('publicLinkStatus', {
          status: shareLink == null ? 'none' : shareLink.disabledAt == null ? 'active' : 'disabled',
        })}
      </p>
      {error == null ? null : (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      {notice == null ? null : (
        <div className="success" role="status">
          {t(notice)}
        </div>
      )}
      {shareLink == null ? (
        <div className="row">
          <Button
            className="secondary"
            disabled={isMutating}
            type="button"
            onClick={() => {
              setNotice(null);
              void createShareLink();
            }}
          >
            {isMutating ? t('creating') : t('createPublicLink')}
          </Button>
        </div>
      ) : (
        <div className="stack">
          <label htmlFor="radix-field-components-dashboard-placeeditor-tsx-8">
            {t('publicURL')}
            <TextInput
              id="radix-field-components-dashboard-placeeditor-tsx-8"
              readOnly
              value={toAbsolutePublicUrl(shareLink.publicUrl)}
            />
          </label>
          <div className="chip-row">
            {shareLink.disabledAt == null ? (
              <span className="chip">{t('active2')}</span>
            ) : (
              <span className="chip">{t('disabled2')}</span>
            )}
            <span className="chip">{t('place')}</span>
          </div>
          <div className="row">
            <Button className="secondary" type="button" onClick={() => void copyPublicUrl()}>
              {t('copyURL')}
            </Button>
            <a href={shareLink.publicUrl} rel="noreferrer" target="_blank">
              {t('openPublicPage')}
            </a>
            <Button
              className={shareLink.disabledAt == null ? 'danger' : 'secondary'}
              disabled={isMutating}
              type="button"
              onClick={() => {
                setNotice(null);
                void setDisabled(shareLink.disabledAt == null);
              }}
            >
              {isMutating
                ? t('saving')
                : shareLink.disabledAt == null
                  ? t('disableLink')
                  : t('reEnableLink')}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

function formatCoordinateInput(value: number): string {
  return value.toFixed(6);
}
