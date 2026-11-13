'use client';

import { useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useId, useRef, useState } from 'react';
import {
  getPlacePreviewCoordinates,
  type PlaceCoordinates,
  parsePlaceCoordinate,
} from '@/components/dashboard/placeCoordinates';
import {
  applyPlaceMapCoordinates,
  createPlaceDraftState,
  discardPlaceDraft,
  isPlaceDraftDirty,
  type PlaceDraft,
  rebasePlaceDraftAfterSave,
  refreshPlaceDraft,
} from '@/components/dashboard/placeDraftState';
import { PlaceRemoteControlAction } from '@/components/dashboard/RemoteControlPanel';
import { ShareLinkFeedback } from '@/components/dashboard/ShareLinkFeedback';
import { getSavedPlaceSnapshot } from '@/components/dashboard/savedPlaceSnapshot';
import { useShareLink } from '@/components/dashboard/useShareLink';
import { normalizeNullable, toAbsolutePublicUrl } from '@/components/dashboard/utils';
import { DEFAULT_MAP_CENTER } from '@/components/mapStyle';
import { Share2Icon } from '@/components/ui/icons';
import { Button, DialogFrame, Disclosure, TextArea, TextInput } from '@/components/ui/radix-ui';
import { errorMessage } from '@/i18n/errors';
import { ApiError, type Place, type PlaceInput } from '@/lib/api';

export default function PlaceEditor({
  draftCoords,
  onCoordinatesChange,
  onDirtyChange,
  onDiscard,
  onSave,
  place,
}: {
  draftCoords?: PlaceCoordinates;
  onCoordinatesChange?: (coords: PlaceCoordinates) => void;
  onDirtyChange?: (isDirty: boolean) => void;
  onDiscard?: (coords: PlaceCoordinates) => void;
  onSave: (input: PlaceInput) => Place | void | Promise<Place> | Promise<void>;
  place: Place | null;
}) {
  const t = useTranslations('PlaceEditor');
  const mapT = useTranslations('MapWorkspace');
  const coordinateHelpId = useId();
  const coordinateErrorId = useId();
  const latitudeRef = useRef<HTMLInputElement | null>(null);
  const longitudeRef = useRef<HTMLInputElement | null>(null);
  const savedPlaceHeadingId = useId();
  const savedPlace = getSavedPlaceSnapshot(place);
  const [draftState, setDraftState] = useState(() =>
    createPlaceDraftState(place, draftCoords ?? DEFAULT_MAP_CENTER),
  );
  const { name, latitude, longitude, description, tags } = draftState.draft;
  const te = useTranslations('Errors');
  const [error, setError] = useState<unknown>(null);
  const latitudeInvalid = error instanceof ApiError && error.code === 'INVALID_LATITUDE';
  const longitudeInvalid = error instanceof ApiError && error.code === 'INVALID_LONGITUDE';
  const [saveNotice, setSaveNotice] = useState<'savedNotice' | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const saveNoticeTimeoutRef = useRef<number | null>(null);
  const lastEmittedCoordsRef = useRef<PlaceCoordinates | null>(null);
  const onDirtyChangeRef = useRef(onDirtyChange);
  const isDirty = isPlaceDraftDirty(draftState);
  const draftLatitude = draftCoords?.latitude;
  const draftLongitude = draftCoords?.longitude;

  useEffect(() => {
    setDraftState((current) => refreshPlaceDraft(current, place));
  }, [place]);

  useEffect(() => {
    if (draftLatitude == null || draftLongitude == null) {
      return;
    }

    const lastEmittedCoords = lastEmittedCoordsRef.current;
    if (
      lastEmittedCoords?.latitude === draftLatitude &&
      lastEmittedCoords.longitude === draftLongitude
    ) {
      return;
    }

    lastEmittedCoordsRef.current = null;
    setDraftState((current) =>
      applyPlaceMapCoordinates(current, { latitude: draftLatitude, longitude: draftLongitude }),
    );
  }, [draftLatitude, draftLongitude]);

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
      const submittedState = draftState;
      const saved = await onSave({
        description: normalizeNullable(description),
        latitude: parsePlaceCoordinate(latitude, 'latitude'),
        longitude: parsePlaceCoordinate(longitude, 'longitude'),
        name,
        tags: tags
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean),
      });
      setDraftState((current) =>
        rebasePlaceDraftAfterSave(current, submittedState, saved ?? undefined),
      );
      setSaveNotice('savedNotice');
      saveNoticeTimeoutRef.current = window.setTimeout(() => {
        setSaveNotice(null);
        saveNoticeTimeoutRef.current = null;
      }, 1000);
    } catch (nextError) {
      setError(nextError);
      if (nextError instanceof ApiError && nextError.code === 'INVALID_LATITUDE')
        latitudeRef.current?.focus();
      if (nextError instanceof ApiError && nextError.code === 'INVALID_LONGITUDE')
        longitudeRef.current?.focus();
    } finally {
      setIsSaving(false);
    }
  }

  function discardChanges() {
    const coords = getPlacePreviewCoordinates(
      draftState.baseline.latitude,
      draftState.baseline.longitude,
    );
    lastEmittedCoordsRef.current = coords;
    setDraftState(discardPlaceDraft(draftState));
    setError(null);
    setSaveNotice(null);
    if (coords != null) onDiscard?.(coords);
  }

  function setDraftField(field: keyof PlaceDraft, value: string) {
    if ((field === 'latitude' && latitudeInvalid) || (field === 'longitude' && longitudeInvalid))
      setError(null);
    setDraftState((current) => ({ ...current, draft: { ...current.draft, [field]: value } }));
  }

  function updateCoordinate(axis: 'latitude' | 'longitude', value: string) {
    setDraftField(axis, value);
    const coords = getPlacePreviewCoordinates(
      axis === 'latitude' ? value : latitude,
      axis === 'longitude' ? value : longitude,
    );
    if (coords != null) {
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
          <div className="error" id={coordinateErrorId} role="alert">
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
            onChange={(event) => setDraftField('name', event.target.value)}
          />
        </label>
        <div className="split">
          <label htmlFor="radix-field-components-dashboard-placeeditor-tsx-2">
            {t('latitude')}
            <TextInput
              id="radix-field-components-dashboard-placeeditor-tsx-2"
              ref={latitudeRef}
              aria-invalid={latitudeInvalid || undefined}
              aria-describedby={
                latitudeInvalid ? `${coordinateHelpId} ${coordinateErrorId}` : coordinateHelpId
              }
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
              ref={longitudeRef}
              aria-invalid={longitudeInvalid || undefined}
              aria-describedby={
                longitudeInvalid ? `${coordinateHelpId} ${coordinateErrorId}` : coordinateHelpId
              }
              required
              inputMode="decimal"
              value={longitude}
              onChange={(event) => updateCoordinate('longitude', event.target.value)}
            />
          </label>
        </div>
        <p className="muted place-coordinate-help" id={coordinateHelpId}>
          {mapT('moveThePinOrEnterExactCoordinatesThenSave')} {t('coordinateHelp')}
        </p>
        <Disclosure className="editor-more-details" summary={t('moreDetails')}>
          <div className="stack">
            <label htmlFor="radix-field-components-dashboard-placeeditor-tsx-4">
              {t('tagsCommaSeparated')}
              <TextInput
                id="radix-field-components-dashboard-placeeditor-tsx-4"
                value={tags}
                onChange={(event) => setDraftField('tags', event.target.value)}
              />
            </label>
            <label htmlFor="radix-field-components-dashboard-placeeditor-tsx-5">
              {t('description')}
              <TextArea
                id="radix-field-components-dashboard-placeeditor-tsx-5"
                value={description}
                onChange={(event) => setDraftField('description', event.target.value)}
              />
            </label>
          </div>
        </Disclosure>
        {savedPlace == null ? (
          <p className="muted place-save-first">{t('saveToUse')}</p>
        ) : (
          <section className="place-saved-section" aria-labelledby={savedPlaceHeadingId}>
            <h3 id={savedPlaceHeadingId}>{t('savedPlace')}</h3>
            <div className="place-saved-identity">
              <strong>{savedPlace.name}</strong>
              <span className="font-mono">{savedPlace.coordinates}</span>
            </div>
            {isDirty ? <p className="place-saved-help">{t('savedLocationHelp')}</p> : null}
            <div className="place-saved-action-buttons">
              <PlaceRemoteControlAction place={place} />
              <DialogFrame
                className="place-action-dialog-card"
                eyebrow={t('savedPlace')}
                open={isShareDialogOpen}
                title={t('sharePlace')}
                trigger={
                  <Button className="secondary" type="button">
                    <Share2Icon aria-hidden /> {t('share')}
                  </Button>
                }
                onOpenChange={setIsShareDialogOpen}
              >
                <div className="place-share-source">
                  <strong>{savedPlace.name}</strong>
                  <span className="font-mono">{savedPlace.coordinates}</span>
                  {isDirty ? <p className="place-saved-help">{t('savedLocationHelp')}</p> : null}
                </div>
                <PlaceSharePanel place={place} />
              </DialogFrame>
            </div>
          </section>
        )}
      </div>
      <footer className="place-editor-footer place-save-footer">
        <div className="place-save-state">
          <span
            className={isDirty || place == null ? 'unsaved-changes-label' : 'muted'}
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            {isSaving ? t('saving') : isDirty || place == null ? t('unsavedChanges') : t('saved')}
          </span>
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
        </div>
        <Button className="place-save-primary" disabled={isSaving} type="submit">
          {isSaving ? t('saving') : saveNotice == null ? t('savePlace') : t('saved')}
        </Button>
      </footer>
    </form>
  );
}

function PlaceSharePanel({ place }: { place: Place | null }) {
  const t = useTranslations('PlaceEditor');
  const {
    createShareLink,
    error,
    readState,
    canMutate,
    isMutating,
    loadShareLink,
    setDisabled,
    shareLink,
  } = useShareLink('places', place?.id ?? null);
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
      </div>
      <p className="muted no-margin">{t('visitorsCanOpenThePublicPageWithoutLoginSignedIn')}</p>
      <ShareLinkFeedback
        readState={readState}
        error={error}
        createLabel={t('createPublicLink')}
        onRetry={() => void loadShareLink()}
      />
      {readState === 'ready' ? (
        <>
          <p className="muted no-margin" role="status">
            {t('publicLinkStatus', {
              status:
                shareLink == null ? 'none' : shareLink.disabledAt == null ? 'active' : 'disabled',
            })}
          </p>
          {notice == null ? null : (
            <div className="success" role="status">
              {t(notice)}
            </div>
          )}
          {shareLink == null ? (
            <div className="row">
              <Button
                disabled={!canMutate}
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
                <Button
                  className="action-state-soft"
                  highContrast
                  variant="soft"
                  type="button"
                  onClick={() => void copyPublicUrl()}
                >
                  {t('copyURL')}
                </Button>
                <a href={shareLink.publicUrl} rel="noreferrer" target="_blank">
                  {t('openPublicPage')}
                </a>
                <Button
                  className="action-state-soft"
                  highContrast
                  variant="soft"
                  color={shareLink.disabledAt == null ? 'red' : undefined}
                  disabled={!canMutate}
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
        </>
      ) : null}
    </section>
  );
}
