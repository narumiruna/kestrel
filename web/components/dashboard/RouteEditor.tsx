'use client';

import { useLocale, useTranslations } from 'next-intl';
import {
  type Dispatch,
  type FormEvent,
  type ReactNode,
  type SetStateAction,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { FavoriteWaypointPicker } from '@/components/dashboard/FavoriteWaypointPicker';
import { RouteRemoteControlAction } from '@/components/dashboard/RemoteControlPanel';
import { RouteSharePanel } from '@/components/dashboard/RouteSharePanel';
import {
  addRouteWaypoint,
  closeRouteLoop,
  getRouteChangeSummary,
  getRouteValidation,
  insertRouteWaypointAfter,
  isRouteDraftDirty,
  moveRouteWaypoint,
  type RouteDraftState,
  type RouteDraftWaypoint,
  redoRoutePath,
  removeRouteWaypoint,
  resetRouteDraft,
  reverseRoute,
  setRouteDraftField,
  toRouteInput,
  undoRoutePath,
  updateRouteWaypoint,
} from '@/components/dashboard/routeDraftState';
import {
  formatWaypointCoords,
  formatWaypointName,
  getWaypointBadgeClassName,
} from '@/components/dashboard/routeEditorUtils';
import { getRouteSavePresentation } from '@/components/dashboard/routeSavePresentation';
import type { RouteWorkflowMode } from '@/components/dashboard/routeWorkflow';
import { formatRouteDistanceFromWaypoints } from '@/components/dashboard/utils';
import {
  canEditRouteOnMap,
  getRouteMapInstruction,
  type RouteMapCapability,
} from '@/components/routeMapCapability';
import {
  Cross2Icon,
  DotsHorizontalIcon,
  Pencil1Icon,
  PlusIcon,
  ResetIcon,
  ResumeIcon,
  Share2Icon,
} from '@/components/ui/icons';
import {
  Button,
  CheckboxField,
  ConfirmDialog,
  DialogFrame,
  Disclosure,
  Menu,
  MenuSurface,
  Tabs,
  TextArea,
  TextInput,
  Toggle,
  ToggleGroup,
} from '@/components/ui/radix-ui';
import { errorMessage } from '@/i18n/errors';
import type { Place, Route, RouteInput, RouteMode, RouteWaypoint } from '@/lib/api';

type CoordinateDialogState =
  | { kind: 'add' }
  | { draftId: string; index: number; kind: 'edit'; waypoint: RouteDraftWaypoint }
  | null;

type Props = {
  configurationSummary?: ReactNode;
  draftState: RouteDraftState;
  hoveredWaypointIndex?: number | null;
  onBeforeNavigateAway?: () => boolean;
  onDelete?: () => Promise<void> | void;
  onFocusTargetChange?: (waypoint: RouteWaypoint | null) => void;
  onHoverWaypointIndexChange?: (index: number | null) => void;
  onRetryPlaces?: () => void;
  isAddingWaypoint: boolean;
  isSaving: boolean;
  onAddingWaypointChange: (adding: boolean) => void;
  onSelectedWaypointIdChange: (id: string | null) => void;
  onModeChange: (mode: RouteWorkflowMode) => void;
  mode: RouteWorkflowMode;
  onShowEntireRoute: () => void;
  onSave: (input: RouteInput) => Promise<void> | void;
  onSelectedWaypointIndexChange?: (index: number | null) => void;
  places?: Place[];
  placesError?: string | null;
  route: Route | null;
  routeMapCapability?: RouteMapCapability;
  selectedWaypointIndex?: number | null;
  setDraftState: Dispatch<SetStateAction<RouteDraftState>>;
};

export default function RouteEditor({
  configurationSummary,
  draftState,
  hoveredWaypointIndex = null,
  onBeforeNavigateAway,
  onDelete,
  onFocusTargetChange,
  onHoverWaypointIndexChange,
  onRetryPlaces,
  onSave,
  onModeChange,
  mode,
  onShowEntireRoute,
  isAddingWaypoint,
  isSaving,
  onAddingWaypointChange,
  onSelectedWaypointIdChange,
  onSelectedWaypointIndexChange,
  places = [],
  placesError = null,
  route,
  routeMapCapability = 'ready',
  selectedWaypointIndex = null,
  setDraftState,
}: Props) {
  const t = useTranslations('routeEditor');
  const ts = useTranslations('routeSave');
  const td = useTranslations('routeDraft');
  const tm = useTranslations('routeMapInstructions');
  const te = useTranslations('Errors');
  const locale = useLocale();
  const revisionLabel =
    route?.currentRevision == null
      ? '—'
      : new Intl.NumberFormat(locale).format(route.currentRevision.revisionNumber);
  const { draft } = draftState;
  const isPointEditing = mode === 'edit';
  const [coordinateDialog, setCoordinateDialogState] = useState<CoordinateDialogState>(null);
  const [draggedWaypointIndex, setDraggedWaypointIndex] = useState<number | null>(null);
  const [dragOverWaypointIndex, setDragOverWaypointIndex] = useState<number | null>(null);
  const [error, setError] = useState<{ cause: unknown } | null>(null);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<{ cause: unknown } | null>(null);
  const deleteInFlightRef = useRef(false);
  const [isDiscardOpen, setIsDiscardOpen] = useState(false);
  const [isFavoritesOpen, setIsFavoritesOpen] = useState(false);
  const [isManageOpen, setIsManageOpen] = useState(true);
  const [isMoreDetailsOpen, setIsMoreDetailsOpen] = useState(false);
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const [saveNotice, setSaveNotice] = useState<'savedNow' | null>(null);
  const moreTriggerRef = useRef<HTMLButtonElement | null>(null);
  const addTriggerRef = useRef<HTMLButtonElement | null>(null);
  const discardTriggerRef = useRef<HTMLButtonElement | null>(null);
  const coordinateRestoreFocusRef = useRef<HTMLElement | null>(null);
  const shareTriggerRef = useRef<HTMLButtonElement | null>(null);
  const waypointRowRefs = useRef<Array<HTMLLIElement | null>>([]);
  const validation = useMemo(() => getRouteValidation(draft, td), [draft, td]);
  const changes = useMemo(() => getRouteChangeSummary(draftState, td), [draftState, td]);
  const isDirty = isRouteDraftDirty(draftState);
  const distanceLabel = useMemo(
    () => formatRouteDistanceFromWaypoints(draft.waypoints, locale),
    [draft.waypoints, locale],
  );
  const selectedWaypoint =
    selectedWaypointIndex == null ? null : (draft.waypoints[selectedWaypointIndex] ?? null);
  const selectedIndex = selectedWaypointIndex ?? 0;
  const selectedWaypointNumber = selectedIndex + 1;
  const canCloseLoop = shouldOfferCloseLoop(draft.mode, draft.waypoints);
  const canUseMap = canEditRouteOnMap(routeMapCapability);
  const mapInstruction = getRouteMapInstruction(routeMapCapability, tm);
  const savePresentation = getRouteSavePresentation(
    {
      changeSummary: changes.join(' · '),
      error: error == null ? null : errorMessage(error.cause, te),
      isDirty,
      isNew: route == null,
      isSaving,
      revisionNumber: route?.currentRevision?.revisionNumber ?? null,
      saveNotice: saveNotice == null ? null : t(saveNotice),
      validationReason: validation.saveDisabledReason,
    },
    ts,
  );
  const savePanel = (
    <div className="route-save-panel">
      <div
        className={`route-save-status route-save-status-${savePresentation.status}`}
        aria-live="polite"
        role={savePresentation.status === 'error' ? 'alert' : 'status'}
      >
        <strong>{savePresentation.title}</strong>
        {savePresentation.detail == null ? null : <span>{savePresentation.detail}</span>}
      </div>
      {savePresentation.showDiscard || savePresentation.showSaveButton ? (
        <div className="route-editor-save-buttons">
          {savePresentation.showDiscard ? (
            <Button
              ref={discardTriggerRef}
              className="secondary"
              disabled={isSaving}
              type="button"
              onClick={() => setIsDiscardOpen(true)}
            >
              {t('discard')}
            </Button>
          ) : null}
          {savePresentation.showSaveButton ? (
            <Button disabled={isSaving || !validation.isValid || !isDirty} type="submit">
              {isSaving ? t('saving') : t('saveRoute')}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );

  useEffect(() => {
    if (selectedWaypointIndex != null && selectedWaypointIndex >= draft.waypoints.length) {
      onSelectedWaypointIndexChange?.(null);
    }
  }, [draft.waypoints.length, onSelectedWaypointIndexChange, selectedWaypointIndex]);

  useEffect(() => {
    if (selectedWaypointIndex != null) setIsManageOpen(true);
  }, [selectedWaypointIndex]);

  useEffect(() => {
    if (mode === 'playback' || !isManageOpen || selectedWaypointIndex == null) {
      return;
    }
    const row = waypointRowRefs.current[selectedWaypointIndex];
    const list = row?.closest<HTMLElement>('.index-card-body');
    if (row == null || list == null) return;
    let frame = 0;
    const revealSelection = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        if (list.clientHeight === 0) return;
        const rowBounds = row.getBoundingClientRect();
        const viewport = list.getBoundingClientRect();
        // Reserve the actual save bar height without moving the page or the map.
        const footer = list.querySelector('.route-save-footer')?.getBoundingClientRect();
        const bottom = Math.min(viewport.bottom, footer?.top ?? viewport.bottom) - 12;
        if (rowBounds.top < viewport.top + 12) {
          list.scrollTop += rowBounds.top - viewport.top - 12;
        } else if (rowBounds.bottom > bottom) {
          list.scrollTop += rowBounds.bottom - bottom;
        }
      });
    };
    const observer = new ResizeObserver(revealSelection);
    observer.observe(list);
    const footerElement = savePresentation.showStickyBar
      ? list.querySelector('.route-save-footer')
      : null;
    if (footerElement != null) observer.observe(footerElement);
    revealSelection();
    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(frame);
    };
  }, [isManageOpen, mode, savePresentation.showStickyBar, selectedWaypointIndex]);

  function setCoordinateDialog(state: CoordinateDialogState) {
    if (state != null) {
      coordinateRestoreFocusRef.current =
        state.kind === 'add'
          ? addTriggerRef.current
          : (waypointRowRefs.current[state.index]?.querySelector('button') ?? null);
    }
    setCoordinateDialogState(state);
  }

  function updateState(
    transform: (state: RouteDraftState) => RouteDraftState,
    selectIndex?: number,
  ) {
    const next = transform(draftState);
    setDraftState(next);
    if (selectIndex != null)
      onSelectedWaypointIdChange(next.draft.waypoints[selectIndex]?.draftId ?? null);
    setError(null);
    setSaveNotice(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSaving || !isDirty) return;
    setError(null);
    setSaveNotice(null);
    if (!validation.isValid) return;

    try {
      await onSave(toRouteInput(draft));
      setSaveNotice('savedNow');
    } catch (nextError) {
      setError({ cause: nextError });
    }
  }

  function addFavoriteWaypoint(place: Place) {
    updateState(
      (state) => addRouteWaypoint(state, { latitude: place.latitude, longitude: place.longitude }),
      draft.waypoints.length,
    );
    onFocusTargetChange?.({ latitude: place.latitude, longitude: place.longitude });
    setIsFavoritesOpen(false);
  }

  function selectWaypoint(waypoint: RouteDraftWaypoint, index: number) {
    onSelectedWaypointIndexChange?.(index);
    onFocusTargetChange?.(waypoint);
  }

  function moveWaypoint(fromIndex: number, toIndex: number) {
    updateState((state) => moveRouteWaypoint(state, fromIndex, toIndex));
  }

  function removeWaypoint(waypoint: RouteDraftWaypoint) {
    updateState((state) => removeRouteWaypoint(state, waypoint.draftId));
  }

  function insertAfter(_waypoint: RouteDraftWaypoint, index: number) {
    updateState((state) => insertRouteWaypointAfter(state, index), index + 1);
  }

  return (
    <form className="panel route-editor route-editor-redesign" onSubmit={submit}>
      <div className="route-editor-content">
        <section className="route-identity-section" aria-labelledby="route-identity-heading">
          <div className="route-editor-title-row">
            <label className="route-title-field" htmlFor="route-name">
              <span id="route-identity-heading">{t('routeName')}</span>
              <TextInput
                id="route-name"
                readOnly={mode !== 'edit'}
                maxLength={128}
                required
                value={draft.name}
                onChange={(event) =>
                  updateState((state) => setRouteDraftField(state, 'name', event.target.value))
                }
              />
            </label>
            <MenuSurface
              trigger={
                <Button
                  ref={moreTriggerRef}
                  aria-label={t('moreActions')}
                  className="secondary route-more-trigger"
                  type="button"
                >
                  <DotsHorizontalIcon />
                </Button>
              }
            >
              <Menu.Item
                className="ui-menu-item"
                disabled={isSaving || !isPointEditing || draft.waypoints.length < 2}
                onClick={() => updateState(reverseRoute)}
              >
                {t('reverse')}
              </Menu.Item>
              {onDelete == null ? null : (
                <>
                  <Menu.Separator className="ui-menu-separator" />
                  <Menu.Item
                    className="ui-menu-item danger"
                    disabled={isSaving}
                    onSelect={() => window.setTimeout(() => setIsDeleteOpen(true), 100)}
                  >
                    {t('deleteAction')}
                  </Menu.Item>
                </>
              )}
            </MenuSurface>
          </div>
          <section className="route-status-line" aria-label={t('draftSummary')}>
            <strong>{t('waypointCount', { count: draft.waypoints.length })}</strong>
            <span>{distanceLabel}</span>
          </section>
          {configurationSummary}
        </section>

        <Button
          className="secondary route-fit-action"
          type="button"
          disabled={!canUseMap || draft.waypoints.length === 0}
          onClick={onShowEntireRoute}
        >
          {t('showEntire')}
        </Button>
        <Tabs.Root value={mode} onValueChange={(value) => onModeChange(value as RouteWorkflowMode)}>
          <Tabs.List aria-label={t('workflow')} className="route-settings-tabs">
            <Tabs.Trigger value="view">{t('view')}</Tabs.Trigger>
            <Tabs.Trigger value="edit">{t('edit')}</Tabs.Trigger>
            <Tabs.Trigger value="playback">{t('playback')}</Tabs.Trigger>
          </Tabs.List>
          {(['view', 'edit'] as const).map((panelMode) => (
            <Tabs.Content key={panelMode} value={panelMode}>
              <section className="route-path-section" aria-labelledby="route-path-heading">
                <div className="route-section-heading">
                  <div>
                    <h3 id="route-path-heading" className="sr-only">
                      {t('path')}
                    </h3>
                    <p className="muted no-margin">
                      {isAddingWaypoint
                        ? t('addingHelp')
                        : canUseMap
                          ? isPointEditing
                            ? t('editHelp')
                            : t('viewHelp')
                          : mapInstruction}
                    </p>
                  </div>
                </div>
                {isPointEditing ? (
                  <div className="route-path-toolbar">
                    <fieldset className="route-path-action-group route-path-add-actions">
                      <legend className="sr-only">{t('addWaypoint')}</legend>
                      <MenuSurface
                        trigger={
                          <Button ref={addTriggerRef} type="button">
                            <PlusIcon /> {t('addWaypoint')}
                          </Button>
                        }
                      >
                        <Menu.Item
                          className="ui-menu-item"
                          disabled={!canUseMap}
                          onSelect={() => onAddingWaypointChange(true)}
                        >
                          {t('onMap')}
                        </Menu.Item>
                        <Menu.Item
                          className="ui-menu-item"
                          onSelect={() => {
                            onAddingWaypointChange(false);
                            window.setTimeout(() => setIsFavoritesOpen(true), 100);
                          }}
                        >
                          {t('fromPlaces')}
                        </Menu.Item>
                        <Menu.Item
                          className="ui-menu-item"
                          onSelect={() => {
                            onAddingWaypointChange(false);
                            window.setTimeout(() => setCoordinateDialog({ kind: 'add' }), 100);
                          }}
                        >
                          {t('enterCoordinates')}
                        </Menu.Item>
                      </MenuSurface>
                      {isAddingWaypoint ? (
                        <Button
                          className="secondary"
                          type="button"
                          onClick={() => onAddingWaypointChange(false)}
                        >
                          <Cross2Icon /> {t('cancelAdding')}
                        </Button>
                      ) : null}
                    </fieldset>
                    <fieldset className="route-path-action-group route-path-history-actions">
                      <legend className="sr-only">{t('history')}</legend>
                      <Button
                        aria-label={t('undoLabel')}
                        className="secondary"
                        disabled={draftState.pastPaths.length === 0}
                        type="button"
                        onClick={() => updateState(undoRoutePath)}
                      >
                        <ResetIcon /> {t('undo')}
                      </Button>
                      <Button
                        aria-label={t('redoLabel')}
                        className="secondary"
                        disabled={draftState.futurePaths.length === 0}
                        type="button"
                        onClick={() => updateState(redoRoutePath)}
                      >
                        <ResumeIcon /> {t('redo')}
                      </Button>
                    </fieldset>
                  </div>
                ) : null}

                <RoutePathGuidance
                  canUseMap={canUseMap}
                  places={places}
                  waypoints={draft.waypoints}
                />

                {selectedWaypoint == null ? (
                  <div className="selected-waypoint-empty">
                    <strong>{draft.waypoints.length === 0 ? t('build') : t('explore')}</strong>
                    <span className="muted">
                      {draft.waypoints.length === 0
                        ? isPointEditing
                          ? t('chooseSource')
                          : t('chooseEdit')
                        : t('selectHelp')}
                    </span>
                  </div>
                ) : (
                  <section
                    className="selected-waypoint-card"
                    aria-label={t('selectedWaypoint', { number: selectedWaypointNumber })}
                  >
                    <div>
                      <span
                        className={getWaypointBadgeClassName(selectedIndex, draft.waypoints.length)}
                      >
                        {new Intl.NumberFormat(locale).format(selectedWaypointNumber)}
                      </span>
                      <span>
                        <strong>
                          {formatWaypointName(
                            selectedWaypoint,
                            places,
                            t('waypoint', { number: selectedWaypointNumber }),
                          )}
                        </strong>
                        <small className="mono">{formatWaypointCoords(selectedWaypoint)}</small>
                      </span>
                    </div>
                    {isPointEditing ? (
                      <div className="selected-waypoint-actions">
                        <Button
                          className="secondary"
                          type="button"
                          onClick={() =>
                            setCoordinateDialog({
                              draftId: selectedWaypoint.draftId,
                              index: selectedIndex,
                              kind: 'edit',
                              waypoint: selectedWaypoint,
                            })
                          }
                        >
                          <Pencil1Icon /> {t('edit')}
                        </Button>
                      </div>
                    ) : null}
                  </section>
                )}

                {isPointEditing && canCloseLoop ? (
                  <div className="close-loop-callout">
                    <span>{t('loopHelp')}</span>
                    <Button
                      className="secondary"
                      type="button"
                      onClick={() => updateState(closeRouteLoop)}
                    >
                      {t('closeLoop')}
                    </Button>
                  </div>
                ) : null}

                <Disclosure
                  className="route-editor-collapsible route-manage-disclosure"
                  open={isManageOpen}
                  summary={<span>{t('waypointsHeading', { count: draft.waypoints.length })}</span>}
                  onOpenChange={setIsManageOpen}
                >
                  <div className="route-editor-collapsible-content">
                    <WaypointList
                      isEditing={isPointEditing}
                      draggedWaypointIndex={draggedWaypointIndex}
                      dragOverWaypointIndex={dragOverWaypointIndex}
                      hoveredWaypointIndex={hoveredWaypointIndex}
                      places={places}
                      selectedWaypointIndex={selectedWaypointIndex}
                      setDraggedWaypointIndex={setDraggedWaypointIndex}
                      setDragOverWaypointIndex={setDragOverWaypointIndex}
                      waypointRowRefs={waypointRowRefs}
                      waypoints={draft.waypoints}
                      onEdit={(waypoint, index) =>
                        setCoordinateDialog({
                          draftId: waypoint.draftId,
                          index,
                          kind: 'edit',
                          waypoint,
                        })
                      }
                      onHover={onHoverWaypointIndexChange}
                      onInsert={insertAfter}
                      onMove={moveWaypoint}
                      onRemove={removeWaypoint}
                      onSelect={selectWaypoint}
                    />
                  </div>
                </Disclosure>
              </section>
            </Tabs.Content>
          ))}
          <Tabs.Content value="playback">
            <section className="route-playback-section" aria-labelledby="route-playback-heading">
              <div>
                <h3 id="route-playback-heading" className="sr-only">
                  {t('playback')}
                </h3>
                <p className="muted no-margin">{t('playbackHelp')}</p>
              </div>
              <label htmlFor="route-speed">
                {t('speed')}
                <TextInput
                  id="route-speed"
                  inputMode="decimal"
                  required
                  value={draft.defaultSpeedKmh}
                  onChange={(event) =>
                    updateState((state) =>
                      setRouteDraftField(state, 'defaultSpeedKmh', event.target.value),
                    )
                  }
                />
              </label>
              <div className="route-mode-choice">
                <span>{t('mode')}</span>
                <ToggleGroup
                  aria-label={t('mode')}
                  type="single"
                  value={draft.mode}
                  onValueChange={(mode) => {
                    if (mode !== '') {
                      updateState((state) => setRouteDraftField(state, 'mode', mode as RouteMode));
                    }
                  }}
                >
                  <Toggle value="ONCE">{t('once')}</Toggle>
                  <Toggle value="LOOP">{t('loop')}</Toggle>
                  <Toggle value="PING_PONG">{t('pingPong')}</Toggle>
                </ToggleGroup>
              </div>
              <p className="muted no-margin">
                {draft.mode === 'ONCE'
                  ? t('onceHelp')
                  : draft.mode === 'LOOP'
                    ? t('loopModeHelp')
                    : t('pingPongHelp')}
              </p>
            </section>
          </Tabs.Content>
        </Tabs.Root>

        {isPointEditing ? (
          <Disclosure
            className="route-editor-collapsible route-more-details-disclosure"
            open={isMoreDetailsOpen}
            summary={
              <>
                <span>{t('details')}</span>
                <span className="muted">{t('descriptionVisibility')}</span>
              </>
            }
            onOpenChange={setIsMoreDetailsOpen}
          >
            <div className="route-editor-collapsible-content">
              <label htmlFor="route-description">
                {t('description')}
                <TextArea
                  id="route-description"
                  maxLength={1024}
                  value={draft.description}
                  onChange={(event) =>
                    updateState((state) =>
                      setRouteDraftField(state, 'description', event.target.value),
                    )
                  }
                />
              </label>
              <CheckboxField
                checked={draft.isPublic}
                onCheckedChange={(isPublic) =>
                  updateState((state) => setRouteDraftField(state, 'isPublic', isPublic))
                }
              >
                {t('markPublic')}
              </CheckboxField>
              <p className="muted no-margin">{t('publicHelp')}</p>
            </div>
          </Disclosure>
        ) : null}

        <section className="route-save-use-section" aria-labelledby="route-save-use-heading">
          <div>
            <h3 id="route-save-use-heading">
              {mode === 'playback' ? t('saveUse') : t('saveShare')}
            </h3>
            <p className="muted no-margin">
              {mode === 'playback' ? t('savePlaybackHelp') : t('saveHelp')}
            </p>
          </div>
          {savePresentation.showStickyBar ? null : savePanel}
          {route == null ? (
            <p className="route-use-note no-margin">{t('saveFirst')}</p>
          ) : (
            <div className="route-use-panel">
              <p className="route-use-note no-margin">
                {isDirty
                  ? t('draftRevision', { revision: revisionLabel })
                  : t('savedRevision', { revision: revisionLabel })}
              </p>
              <div className="route-use-actions">
                {mode === 'playback' ? (
                  <RouteRemoteControlAction
                    isDirty={isDirty}
                    mode={draft.mode}
                    route={route}
                    speedKmh={Number(draft.defaultSpeedKmh)}
                    waypoints={draft.waypoints}
                  />
                ) : null}
                <Button
                  ref={shareTriggerRef}
                  aria-haspopup="dialog"
                  className="secondary route-share-action"
                  type="button"
                  onClick={() => setIsShareDialogOpen(true)}
                >
                  <Share2Icon /> {t('shareRevision')}
                </Button>
              </div>
            </div>
          )}
        </section>
      </div>

      {savePresentation.showStickyBar ? (
        <footer className="route-save-footer">{savePanel}</footer>
      ) : null}

      <DialogFrame
        className="place-action-dialog-card"
        description={t('choosePlace')}
        eyebrow={t('waypointLabel')}
        open={isFavoritesOpen}
        restoreFocusElement={addTriggerRef.current}
        title={t('addFromPlaces')}
        onOpenChange={setIsFavoritesOpen}
      >
        {placesError == null ? null : (
          <div className="route-partial-error" role="alert">
            <span>{placesError}</span>
            <Button className="secondary" type="button" onClick={onRetryPlaces}>
              {t('retryPlaces')}
            </Button>
          </div>
        )}
        <FavoriteWaypointPicker
          mode={draft.waypoints.length === 0 ? 'start' : 'append'}
          places={places}
          showHeading={false}
          onBeforeNavigate={onBeforeNavigateAway}
          onSelect={addFavoriteWaypoint}
        />
      </DialogFrame>

      <DialogFrame
        className="place-action-dialog-card"
        description={
          route == null
            ? t('saveBeforeLink')
            : isDirty
              ? t('shareDirtyHelp', { revision: revisionLabel })
              : t('shareHelp', { revision: revisionLabel })
        }
        eyebrow={t('shareSaved')}
        open={isShareDialogOpen}
        restoreFocusElement={shareTriggerRef.current}
        title={route?.name ?? t('shareRoute')}
        onOpenChange={setIsShareDialogOpen}
      >
        <RouteSharePanel route={route} />
      </DialogFrame>

      <WaypointCoordinateDialog
        state={coordinateDialog}
        restoreFocusElement={coordinateRestoreFocusRef.current}
        onOpenChange={(open) => {
          if (!open) {
            setCoordinateDialog(null);
          }
        }}
        onSave={(nextWaypoint) => {
          if (coordinateDialog?.kind === 'edit') {
            updateState((state) =>
              updateRouteWaypoint(state, coordinateDialog.draftId, nextWaypoint),
            );
            onSelectedWaypointIdChange(coordinateDialog.draftId);
          } else {
            updateState((state) => addRouteWaypoint(state, nextWaypoint), draft.waypoints.length);
          }
          onFocusTargetChange?.(nextWaypoint);
          setCoordinateDialog(null);
        }}
      />

      <ConfirmDialog
        confirmLabel={t('discardChanges')}
        description={t('discardHelp')}
        open={isDiscardOpen}
        restoreFocusElement={discardTriggerRef.current}
        title={t('discardTitle')}
        onConfirm={() => {
          setDraftState(resetRouteDraft);
          onSelectedWaypointIndexChange?.(null);
          onFocusTargetChange?.(null);
          onAddingWaypointChange(false);
          setError(null);
          setSaveNotice(null);
          setIsDiscardOpen(false);
        }}
        onOpenChange={setIsDiscardOpen}
      />

      <ConfirmDialog
        confirmLabel={t('deleteRoute')}
        description={
          <>
            {t('deleteHelp')}
            {deleteError == null ? null : (
              <span className="error" role="alert">
                {errorMessage(deleteError.cause, te)}
              </span>
            )}
          </>
        }
        open={isDeleteOpen}
        restoreFocusElement={moreTriggerRef.current}
        title={t('deleteTitle', { name: route?.name ?? draft.name })}
        onConfirm={async () => {
          deleteInFlightRef.current = true;
          setDeleteError(null);
          try {
            await onDelete?.();
            setIsDeleteOpen(false);
          } catch (nextError) {
            setDeleteError({ cause: nextError });
          } finally {
            deleteInFlightRef.current = false;
          }
        }}
        onOpenChange={(open) => {
          if (!deleteInFlightRef.current) setIsDeleteOpen(open);
        }}
      />
    </form>
  );
}

function RoutePathGuidance({
  canUseMap,
  places,
  waypoints,
}: {
  canUseMap: boolean;
  places: Place[];
  waypoints: RouteDraftWaypoint[];
}) {
  const t = useTranslations('routeEditor');
  const first = waypoints[0];

  if (first == null) {
    return (
      <div className="route-path-guidance">
        <span className="route-rail-node is-start" />
        <span>
          <strong>{t('firstWaypoint')}</strong>
          <small>{canUseMap ? t('firstMapHelp') : t('firstNoMapHelp')}</small>
        </span>
      </div>
    );
  }

  if (waypoints.length === 1) {
    return (
      <div className="route-path-guidance">
        <span className="route-rail-node is-start" />
        <span>
          <strong>
            {t('startName', {
              name: formatWaypointName(first, places, t('waypoint', { number: 1 })),
            })}
          </strong>
          <small>{t('oneMore')}</small>
        </span>
      </div>
    );
  }

  return null;
}

function WaypointList({
  isEditing,
  draggedWaypointIndex,
  dragOverWaypointIndex,
  hoveredWaypointIndex,
  onEdit,
  onHover,
  onInsert,
  onMove,
  onRemove,
  onSelect,
  places,
  selectedWaypointIndex,
  setDraggedWaypointIndex,
  setDragOverWaypointIndex,
  waypointRowRefs,
  waypoints,
}: {
  isEditing: boolean;
  draggedWaypointIndex: number | null;
  dragOverWaypointIndex: number | null;
  hoveredWaypointIndex: number | null;
  onEdit: (waypoint: RouteDraftWaypoint, index: number) => void;
  onHover?: (index: number | null) => void;
  onInsert: (waypoint: RouteDraftWaypoint, index: number) => void;
  onMove: (fromIndex: number, toIndex: number) => void;
  onRemove: (waypoint: RouteDraftWaypoint, index: number) => void;
  onSelect: (waypoint: RouteDraftWaypoint, index: number) => void;
  places: Place[];
  selectedWaypointIndex: number | null;
  setDraggedWaypointIndex: (index: number | null) => void;
  setDragOverWaypointIndex: (index: number | null) => void;
  waypointRowRefs: React.MutableRefObject<Array<HTMLLIElement | null>>;
  waypoints: RouteDraftWaypoint[];
}) {
  const t = useTranslations('routeEditor');
  const locale = useLocale();
  if (waypoints.length === 0) {
    return <p className="muted no-margin">{t('noWaypoints')}</p>;
  }

  return (
    <ul className="waypoint-list" aria-label={t('waypointsLabel')}>
      {waypoints.map((waypoint, index) => {
        const name = formatWaypointName(waypoint, places, t('waypoint', { number: index + 1 }));
        const className = [
          'waypoint-row',
          selectedWaypointIndex === index ? 'selected' : '',
          hoveredWaypointIndex === index ? 'hovered' : '',
          draggedWaypointIndex === index ? 'is-dragging' : '',
          dragOverWaypointIndex === index && draggedWaypointIndex !== index ? 'is-drop-target' : '',
        ]
          .filter(Boolean)
          .join(' ');

        return (
          <li
            aria-current={selectedWaypointIndex === index ? 'true' : undefined}
            className={className}
            draggable={isEditing}
            key={waypoint.draftId}
            ref={(element) => {
              waypointRowRefs.current[index] = element;
            }}
            onDragEnd={() => {
              setDraggedWaypointIndex(null);
              setDragOverWaypointIndex(null);
            }}
            onDragEnter={() => {
              if (isEditing && draggedWaypointIndex != null) setDragOverWaypointIndex(index);
            }}
            onDragOver={(event) => {
              if (isEditing && draggedWaypointIndex != null) event.preventDefault();
            }}
            onDragStart={(event) => {
              if (!isEditing) {
                event.preventDefault();
                return;
              }
              setDraggedWaypointIndex(index);
              event.dataTransfer.effectAllowed = 'move';
              event.dataTransfer.setData('text/plain', String(index));
            }}
            onDrop={(event) => {
              if (!isEditing || draggedWaypointIndex == null) return;
              event.preventDefault();
              onMove(draggedWaypointIndex, index);
              setDraggedWaypointIndex(null);
              setDragOverWaypointIndex(null);
            }}
            onFocusCapture={() => onHover?.(index)}
            onMouseEnter={() => onHover?.(index)}
            onMouseLeave={() => onHover?.(null)}
          >
            <Button
              className="waypoint-focus"
              type="button"
              onClick={() => onSelect(waypoint, index)}
            >
              <span className={getWaypointBadgeClassName(index, waypoints.length)}>
                {new Intl.NumberFormat(locale).format(index + 1)}
              </span>
              <span className="waypoint-main">
                <span className="waypoint-name">{name}</span>
                <span className="waypoint-coordinates mono">{formatWaypointCoords(waypoint)}</span>
              </span>
            </Button>
            {isEditing ? (
              <MenuSurface
                className="waypoint-menu-content"
                trigger={
                  <Button
                    aria-label={t('moreOptions', { name })}
                    className="waypoint-menu-trigger"
                    type="button"
                  >
                    <DotsHorizontalIcon />
                  </Button>
                }
              >
                <Menu.Item
                  className="ui-menu-item"
                  disabled={index === 0}
                  onClick={() => onMove(index, index - 1)}
                >
                  {t('moveUp')}
                </Menu.Item>
                <Menu.Item
                  className="ui-menu-item"
                  disabled={index === waypoints.length - 1}
                  onClick={() => onMove(index, index + 1)}
                >
                  {t('moveDown')}
                </Menu.Item>
                <Menu.Item className="ui-menu-item" onClick={() => onInsert(waypoint, index)}>
                  {t('duplicateAfter')}
                </Menu.Item>
                <Menu.Item className="ui-menu-item" onClick={() => onEdit(waypoint, index)}>
                  {t('editCoordinates')}
                </Menu.Item>
                <Menu.Separator className="ui-menu-separator" />
                <Menu.Item
                  className="ui-menu-item danger"
                  onClick={() => onRemove(waypoint, index)}
                >
                  {t('remove')}
                </Menu.Item>
              </MenuSurface>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function WaypointCoordinateDialog({
  onOpenChange,
  onSave,
  restoreFocusElement,
  state,
}: {
  restoreFocusElement: HTMLElement | null;
  onOpenChange: (open: boolean) => void;
  onSave: (waypoint: RouteWaypoint) => void;
  state: CoordinateDialogState;
}) {
  const t = useTranslations('routeEditor');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [error, setError] = useState<'latitudeError' | 'longitudeError' | null>(null);

  useEffect(() => {
    if (state == null) {
      return;
    }
    setLatitude(state.kind === 'edit' ? state.waypoint.latitude.toFixed(6) : '');
    setLongitude(state.kind === 'edit' ? state.waypoint.longitude.toFixed(6) : '');
    setError(null);
  }, [state]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    event.stopPropagation();
    const nextLatitude = Number(latitude.trim());
    const nextLongitude = Number(longitude.trim());
    if (
      !latitude.trim() ||
      !Number.isFinite(nextLatitude) ||
      nextLatitude < -90 ||
      nextLatitude > 90
    ) {
      setError('latitudeError');
      return;
    }
    if (
      !longitude.trim() ||
      !Number.isFinite(nextLongitude) ||
      nextLongitude < -180 ||
      nextLongitude > 180
    ) {
      setError('longitudeError');
      return;
    }
    onSave({ latitude: nextLatitude, longitude: nextLongitude });
  }

  return (
    <DialogFrame
      description={t('coordinatesHelp')}
      eyebrow={t('waypointLabel')}
      open={state != null}
      restoreFocusElement={restoreFocusElement}
      title={
        state?.kind === 'edit'
          ? t('editWaypoint', { number: state.index + 1 })
          : t('addCoordinates')
      }
      onOpenChange={onOpenChange}
    >
      <form className="stack" onSubmit={submit}>
        {error == null ? null : (
          <div className="error" role="alert">
            {t(error)}
          </div>
        )}
        <div className="split">
          <label htmlFor="waypoint-latitude">
            {t('latitude')}
            <TextInput
              id="waypoint-latitude"
              autoFocus
              inputMode="decimal"
              required
              value={latitude}
              onChange={(event) => setLatitude(event.target.value)}
            />
          </label>
          <label htmlFor="waypoint-longitude">
            {t('longitude')}
            <TextInput
              id="waypoint-longitude"
              inputMode="decimal"
              required
              value={longitude}
              onChange={(event) => setLongitude(event.target.value)}
            />
          </label>
        </div>
        <div className="ui-dialog-actions">
          <Button className="secondary" type="button" onClick={() => onOpenChange(false)}>
            {t('cancel')}
          </Button>
          <Button type="submit">
            {state?.kind === 'edit' ? t('saveCoordinates') : t('addWaypoint')}
          </Button>
        </div>
      </form>
    </DialogFrame>
  );
}

function shouldOfferCloseLoop(mode: RouteMode, waypoints: RouteDraftWaypoint[]): boolean {
  if (mode !== 'LOOP' || waypoints.length < 2) {
    return false;
  }
  const first = waypoints[0];
  const last = waypoints.at(-1);
  return last != null && (first.latitude !== last.latitude || first.longitude !== last.longitude);
}
