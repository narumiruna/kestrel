'use client';

import {
  type Dispatch,
  type FormEvent,
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
import { formatError, formatRouteDistanceFromWaypoints } from '@/components/dashboard/utils';
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
import type { Place, Route, RouteInput, RouteMode, RouteWaypoint } from '@/lib/api';

type CoordinateDialogState =
  | { kind: 'add' }
  | { draftId: string; index: number; kind: 'edit'; waypoint: RouteDraftWaypoint }
  | null;

type Props = {
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
  const { draft } = draftState;
  const isPointEditing = mode === 'edit';
  const [coordinateDialog, setCoordinateDialogState] = useState<CoordinateDialogState>(null);
  const [draggedWaypointIndex, setDraggedWaypointIndex] = useState<number | null>(null);
  const [dragOverWaypointIndex, setDragOverWaypointIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const deleteInFlightRef = useRef(false);
  const [isDiscardOpen, setIsDiscardOpen] = useState(false);
  const [isFavoritesOpen, setIsFavoritesOpen] = useState(false);
  const [isManageOpen, setIsManageOpen] = useState(true);
  const [isMoreDetailsOpen, setIsMoreDetailsOpen] = useState(false);
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const moreTriggerRef = useRef<HTMLButtonElement | null>(null);
  const addTriggerRef = useRef<HTMLButtonElement | null>(null);
  const discardTriggerRef = useRef<HTMLButtonElement | null>(null);
  const coordinateRestoreFocusRef = useRef<HTMLElement | null>(null);
  const shareTriggerRef = useRef<HTMLButtonElement | null>(null);
  const waypointRowRefs = useRef<Array<HTMLLIElement | null>>([]);
  const validation = useMemo(() => getRouteValidation(draft), [draft]);
  const changes = useMemo(() => getRouteChangeSummary(draftState), [draftState]);
  const isDirty = isRouteDraftDirty(draftState);
  const distanceLabel = useMemo(
    () => formatRouteDistanceFromWaypoints(draft.waypoints),
    [draft.waypoints],
  );
  const selectedWaypoint =
    selectedWaypointIndex == null ? null : (draft.waypoints[selectedWaypointIndex] ?? null);
  const selectedIndex = selectedWaypointIndex ?? 0;
  const selectedWaypointNumber = selectedIndex + 1;
  const canCloseLoop = shouldOfferCloseLoop(draft.mode, draft.waypoints);
  const canUseMap = canEditRouteOnMap(routeMapCapability);
  const mapInstruction = getRouteMapInstruction(routeMapCapability);
  const savePresentation = getRouteSavePresentation({
    changeSummary: changes.join(' · '),
    error,
    isDirty,
    isNew: route == null,
    isSaving,
    revisionNumber: route?.currentRevision?.revisionNumber ?? null,
    saveNotice,
    validationReason: validation.saveDisabledReason,
  });
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
              Discard
            </Button>
          ) : null}
          {savePresentation.showSaveButton ? (
            <Button disabled={isSaving || !validation.isValid || !isDirty} type="submit">
              {isSaving ? 'Saving…' : 'Save route'}
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
    if (!validation.isValid) {
      setError(validation.saveDisabledReason);
      return;
    }

    try {
      await onSave(toRouteInput(draft));
      setSaveNotice('Saved just now.');
    } catch (nextError) {
      setError(formatError(nextError));
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
              <span id="route-identity-heading">Route name</span>
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
                  aria-label="More route actions"
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
                Reverse route
              </Menu.Item>
              {onDelete == null ? null : (
                <>
                  <Menu.Separator className="ui-menu-separator" />
                  <Menu.Item
                    className="ui-menu-item danger"
                    disabled={isSaving}
                    onSelect={() => window.setTimeout(() => setIsDeleteOpen(true), 100)}
                  >
                    Delete route…
                  </Menu.Item>
                </>
              )}
            </MenuSurface>
          </div>
          <section className="route-status-line" aria-label="Route draft summary">
            <strong>{draft.waypoints.length} waypoints</strong>
            <span>{distanceLabel}</span>
          </section>
        </section>

        <Button
          className="secondary route-fit-action"
          type="button"
          disabled={!canUseMap || draft.waypoints.length === 0}
          onClick={onShowEntireRoute}
        >
          Show entire route
        </Button>
        <Tabs.Root value={mode} onValueChange={(value) => onModeChange(value as RouteWorkflowMode)}>
          <Tabs.List aria-label="Route workflow" className="route-settings-tabs">
            <Tabs.Trigger value="view">View</Tabs.Trigger>
            <Tabs.Trigger value="edit">Edit</Tabs.Trigger>
            <Tabs.Trigger value="playback">Playback</Tabs.Trigger>
          </Tabs.List>
          {(['view', 'edit'] as const).map((panelMode) => (
            <Tabs.Content key={panelMode} value={panelMode}>
              <section className="route-path-section" aria-labelledby="route-path-heading">
                <div className="route-section-heading">
                  <div>
                    <h3 id="route-path-heading" className="sr-only">
                      Path
                    </h3>
                    <p className="muted no-margin">
                      {isAddingWaypoint
                        ? 'Click the map to append points. Cancel when finished.'
                        : canUseMap
                          ? isPointEditing
                            ? 'Edit mode: select or drag a point. Changes stay in your draft until saved.'
                            : 'View mode: select a waypoint on the map or in the list. Choose Edit to change this route.'
                          : mapInstruction}
                    </p>
                  </div>
                </div>
                {isPointEditing ? (
                  <div className="route-path-toolbar">
                    <fieldset className="route-path-action-group route-path-add-actions">
                      <legend className="sr-only">Add waypoint</legend>
                      <MenuSurface
                        trigger={
                          <Button ref={addTriggerRef} type="button">
                            <PlusIcon /> Add waypoint
                          </Button>
                        }
                      >
                        <Menu.Item
                          className="ui-menu-item"
                          disabled={!canUseMap}
                          onSelect={() => onAddingWaypointChange(true)}
                        >
                          On the map
                        </Menu.Item>
                        <Menu.Item
                          className="ui-menu-item"
                          onSelect={() => {
                            onAddingWaypointChange(false);
                            window.setTimeout(() => setIsFavoritesOpen(true), 100);
                          }}
                        >
                          From saved places…
                        </Menu.Item>
                        <Menu.Item
                          className="ui-menu-item"
                          onSelect={() => {
                            onAddingWaypointChange(false);
                            window.setTimeout(() => setCoordinateDialog({ kind: 'add' }), 100);
                          }}
                        >
                          Enter coordinates…
                        </Menu.Item>
                      </MenuSurface>
                      {isAddingWaypoint ? (
                        <Button
                          className="secondary"
                          type="button"
                          onClick={() => onAddingWaypointChange(false)}
                        >
                          <Cross2Icon /> Cancel adding
                        </Button>
                      ) : null}
                    </fieldset>
                    <fieldset className="route-path-action-group route-path-history-actions">
                      <legend className="sr-only">History</legend>
                      <Button
                        aria-label="Undo last path change"
                        className="secondary"
                        disabled={draftState.pastPaths.length === 0}
                        type="button"
                        onClick={() => updateState(undoRoutePath)}
                      >
                        <ResetIcon /> Undo
                      </Button>
                      <Button
                        aria-label="Redo last path change"
                        className="secondary"
                        disabled={draftState.futurePaths.length === 0}
                        type="button"
                        onClick={() => updateState(redoRoutePath)}
                      >
                        <ResumeIcon /> Redo
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
                    <strong>
                      {draft.waypoints.length === 0 ? 'Build your route' : 'Explore the waypoints'}
                    </strong>
                    <span className="muted">
                      {draft.waypoints.length === 0
                        ? isPointEditing
                          ? 'Choose Add waypoint to select a source.'
                          : 'Choose Edit, then Add waypoint to start.'
                        : 'Select a waypoint on the map or in the list below to see its position.'}
                    </span>
                  </div>
                ) : (
                  <section
                    className="selected-waypoint-card"
                    aria-label={`Selected waypoint ${selectedWaypointNumber}`}
                  >
                    <div>
                      <span
                        className={getWaypointBadgeClassName(selectedIndex, draft.waypoints.length)}
                      >
                        {selectedWaypointNumber}
                      </span>
                      <span>
                        <strong>
                          {formatWaypointName(
                            selectedWaypoint,
                            places,
                            `Waypoint ${selectedWaypointNumber}`,
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
                          <Pencil1Icon /> Edit
                        </Button>
                      </div>
                    ) : null}
                  </section>
                )}

                {isPointEditing && canCloseLoop ? (
                  <div className="close-loop-callout">
                    <span>
                      Repeat will jump from the last waypoint to the first. Add the return segment
                      for continuous movement.
                    </span>
                    <Button
                      className="secondary"
                      type="button"
                      onClick={() => updateState(closeRouteLoop)}
                    >
                      Close loop
                    </Button>
                  </div>
                ) : null}

                <Disclosure
                  className="route-editor-collapsible route-manage-disclosure"
                  open={isManageOpen}
                  summary={<span>Waypoints ({draft.waypoints.length})</span>}
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
                  Playback
                </h3>
                <p className="muted no-margin">
                  Preview the path without moving points. Choose how Android moves through it.
                </p>
              </div>
              <label htmlFor="route-speed">
                Default speed (km/h)
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
                <span>Playback mode</span>
                <ToggleGroup
                  aria-label="Playback mode"
                  type="single"
                  value={draft.mode}
                  onValueChange={(mode) => {
                    if (mode !== '') {
                      updateState((state) => setRouteDraftField(state, 'mode', mode as RouteMode));
                    }
                  }}
                >
                  <Toggle value="ONCE">One way</Toggle>
                  <Toggle value="LOOP">Repeat</Toggle>
                  <Toggle value="PING_PONG">Back and forth</Toggle>
                </ToggleGroup>
              </div>
              <p className="muted no-margin">
                {draft.mode === 'ONCE'
                  ? 'Travel to the end, then stop.'
                  : draft.mode === 'LOOP'
                    ? 'Repeat from the start after reaching the end.'
                    : 'Travel to the end, then reverse direction and repeat.'}
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
                <span>Route details</span>
                <span className="muted">Description and visibility</span>
              </>
            }
            onOpenChange={setIsMoreDetailsOpen}
          >
            <div className="route-editor-collapsible-content">
              <label htmlFor="route-description">
                Description (optional)
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
                Mark route as public
              </CheckboxField>
              <p className="muted no-margin">
                This compatibility flag does not create a public link. Use Share after saving to
                manage the link.
              </p>
            </div>
          </Disclosure>
        ) : null}

        <section className="route-save-use-section" aria-labelledby="route-save-use-heading">
          <div>
            <h3 id="route-save-use-heading">
              {mode === 'playback' ? 'Save & use' : 'Save & share'}
            </h3>
            <p className="muted no-margin">
              {mode === 'playback'
                ? 'Save manually, then send the intended snapshot to Android.'
                : 'Save manually. Device controls are in Playback.'}
            </p>
          </div>
          {savePresentation.showStickyBar ? null : savePanel}
          {route == null ? (
            <p className="route-use-note no-margin">
              Save this route once to enable device playback and sharing.
            </p>
          ) : (
            <div className="route-use-panel">
              <p className="route-use-note no-margin">
                {isDirty
                  ? `Device uses the current draft. Share uses saved Revision ${route.currentRevision?.revisionNumber ?? '—'}.`
                  : `Device and Share use saved Revision ${route.currentRevision?.revisionNumber ?? '—'}.`}
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
                  <Share2Icon /> Share saved revision
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
        description="Choose one saved place to append to the current path."
        eyebrow="Waypoint"
        open={isFavoritesOpen}
        restoreFocusElement={addTriggerRef.current}
        title="Add from saved places"
        onOpenChange={setIsFavoritesOpen}
      >
        {placesError == null ? null : (
          <div className="route-partial-error" role="alert">
            <span>{placesError}</span>
            <Button className="secondary" type="button" onClick={onRetryPlaces}>
              Retry saved places
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
            ? 'Save this route before creating a public link.'
            : isDirty
              ? `This link uses saved Revision ${route.currentRevision?.revisionNumber ?? '—'}. Unsaved changes are not included.`
              : `This link uses saved Revision ${route.currentRevision?.revisionNumber ?? '—'}.`
        }
        eyebrow="Share saved route"
        open={isShareDialogOpen}
        restoreFocusElement={shareTriggerRef.current}
        title={route?.name ?? 'Share route'}
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
        confirmLabel="Discard changes"
        description="This restores the saved route and clears the path Undo/Redo history."
        open={isDiscardOpen}
        restoreFocusElement={discardTriggerRef.current}
        title="Discard unsaved changes?"
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
        confirmLabel="Delete route"
        description={
          <>
            This cannot be undone. The route, its revisions, and its public share link will be
            permanently removed.
            {deleteError == null ? null : (
              <span className="error" role="alert">
                {deleteError}
              </span>
            )}
          </>
        }
        open={isDeleteOpen}
        restoreFocusElement={moreTriggerRef.current}
        title={`Delete “${route?.name ?? draft.name}”?`}
        onConfirm={async () => {
          deleteInFlightRef.current = true;
          setDeleteError(null);
          try {
            await onDelete?.();
            setIsDeleteOpen(false);
          } catch (nextError) {
            setDeleteError(formatError(nextError));
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
  const first = waypoints[0];

  if (first == null) {
    return (
      <div className="route-path-guidance">
        <span className="route-rail-node is-start" />
        <span>
          <strong>Add the first waypoint</strong>
          <small>
            {canUseMap
              ? 'Use the map, a saved place, or exact coordinates.'
              : 'Use a saved place or exact coordinates.'}
          </small>
        </span>
      </div>
    );
  }

  if (waypoints.length === 1) {
    return (
      <div className="route-path-guidance">
        <span className="route-rail-node is-start" />
        <span>
          <strong>Start: {formatWaypointName(first, places, 'Waypoint 1')}</strong>
          <small>Add one more waypoint to complete the route.</small>
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
  if (waypoints.length === 0) {
    return <p className="muted no-margin">No waypoints yet.</p>;
  }

  return (
    <ul className="waypoint-list" aria-label="Route waypoints">
      {waypoints.map((waypoint, index) => {
        const name = formatWaypointName(waypoint, places, `Waypoint ${index + 1}`);
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
                {index + 1}
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
                    aria-label={`More options for ${name}`}
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
                  Move up
                </Menu.Item>
                <Menu.Item
                  className="ui-menu-item"
                  disabled={index === waypoints.length - 1}
                  onClick={() => onMove(index, index + 1)}
                >
                  Move down
                </Menu.Item>
                <Menu.Item className="ui-menu-item" onClick={() => onInsert(waypoint, index)}>
                  Duplicate after
                </Menu.Item>
                <Menu.Item className="ui-menu-item" onClick={() => onEdit(waypoint, index)}>
                  Edit coordinates
                </Menu.Item>
                <Menu.Separator className="ui-menu-separator" />
                <Menu.Item
                  className="ui-menu-item danger"
                  onClick={() => onRemove(waypoint, index)}
                >
                  Remove from route
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
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [error, setError] = useState<string | null>(null);

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
      setError('Latitude must be a number between -90 and 90.');
      return;
    }
    if (
      !longitude.trim() ||
      !Number.isFinite(nextLongitude) ||
      nextLongitude < -180 ||
      nextLongitude > 180
    ) {
      setError('Longitude must be a number between -180 and 180.');
      return;
    }
    onSave({ latitude: nextLatitude, longitude: nextLongitude });
  }

  return (
    <DialogFrame
      description="Add a custom waypoint without using the map, or enter exact values for the selected point."
      eyebrow="Waypoint"
      open={state != null}
      restoreFocusElement={restoreFocusElement}
      title={state?.kind === 'edit' ? `Edit waypoint ${state.index + 1}` : 'Add coordinates'}
      onOpenChange={onOpenChange}
    >
      <form className="stack" onSubmit={submit}>
        {error == null ? null : (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        <div className="split">
          <label htmlFor="waypoint-latitude">
            Latitude
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
            Longitude
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
            Cancel
          </Button>
          <Button type="submit">
            {state?.kind === 'edit' ? 'Save coordinates' : 'Add waypoint'}
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
