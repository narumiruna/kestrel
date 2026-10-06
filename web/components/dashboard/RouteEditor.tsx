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
  isPointEditing: boolean;
  isAddingWaypoint: boolean;
  onPointEditingChange: (editing: boolean) => void;
  onAddingWaypointChange: (adding: boolean) => void;
  onSelectedWaypointIdChange: (id: string | null) => void;
  onSectionChange: (section: 'path' | 'playback') => void;
  section: 'path' | 'playback';
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
  onSectionChange,
  section,
  isPointEditing,
  isAddingWaypoint,
  onPointEditingChange,
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
  const [coordinateDialog, setCoordinateDialog] = useState<CoordinateDialogState>(null);
  const [draggedWaypointIndex, setDraggedWaypointIndex] = useState<number | null>(null);
  const [dragOverWaypointIndex, setDragOverWaypointIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isFavoritesOpen, setIsFavoritesOpen] = useState(false);
  const [isManageOpen, setIsManageOpen] = useState(true);
  const [isMoreDetailsOpen, setIsMoreDetailsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const moreTriggerRef = useRef<HTMLButtonElement | null>(null);
  const savedPlaceTriggerRef = useRef<HTMLButtonElement | null>(null);
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
              className="secondary"
              disabled={isSaving}
              type="button"
              onClick={() => {
                setDraftState(resetRouteDraft);
                onSelectedWaypointIndexChange?.(null);
                onFocusTargetChange?.(null);
                setError(null);
                setSaveNotice(null);
              }}
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
    if (section !== 'path' || !isManageOpen || selectedWaypointIndex == null) {
      return;
    }
    const row = waypointRowRefs.current[selectedWaypointIndex];
    const list = row?.parentElement;
    if (row == null || list == null) return;
    let frame = 0;
    const revealSelection = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        if (list.clientHeight === 0) return;
        list.scrollTop +=
          row.getBoundingClientRect().top -
          list.getBoundingClientRect().top -
          (list.clientHeight - row.clientHeight) / 2;
      });
    };
    const observer = new ResizeObserver(revealSelection);
    observer.observe(list);
    revealSelection();
    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(frame);
    };
  }, [isManageOpen, section, selectedWaypointIndex]);

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
    setError(null);
    setSaveNotice(null);
    if (!validation.isValid) {
      setError(validation.saveDisabledReason);
      return;
    }

    setIsSaving(true);
    try {
      await onSave(toRouteInput(draft));
      setSaveNotice('Saved just now.');
    } catch (nextError) {
      setError(formatError(nextError));
    } finally {
      setIsSaving(false);
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
    onPointEditingChange(true);
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
                disabled={draft.waypoints.length < 2}
                onClick={() => updateState(reverseRoute)}
              >
                Reverse route
              </Menu.Item>
              {onDelete == null ? null : (
                <>
                  <Menu.Separator className="ui-menu-separator" />
                  <Menu.Item
                    className="ui-menu-item danger"
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

        <Tabs.Root
          value={section}
          onValueChange={(value) => onSectionChange(value as 'path' | 'playback')}
        >
          <Tabs.List aria-label="Route settings" className="route-settings-tabs">
            <Tabs.Trigger value="path">Path</Tabs.Trigger>
            <Tabs.Trigger value="playback">Playback</Tabs.Trigger>
          </Tabs.List>
          <Tabs.Content value="path">
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
                        ? 'Select a point to edit. Drag in Edit points mode; use Add on map to append.'
                        : mapInstruction}
                  </p>
                </div>
              </div>
              <ToggleGroup
                aria-label="Route map mode"
                className="route-map-mode"
                type="single"
                value={isPointEditing ? 'edit' : 'overview'}
                onValueChange={(value) => {
                  if (value) onPointEditingChange(value === 'edit');
                }}
              >
                <Toggle value="overview">Overview</Toggle>
                <Toggle value="edit">Edit points</Toggle>
              </ToggleGroup>
              <div className="route-path-toolbar">
                <fieldset className="route-path-action-group route-path-add-actions">
                  <legend className="sr-only">Add waypoint</legend>
                  <Button
                    className="secondary"
                    type="button"
                    disabled={!canUseMap}
                    aria-pressed={isAddingWaypoint}
                    onClick={() => {
                      onPointEditingChange(true);
                      onAddingWaypointChange(!isAddingWaypoint);
                    }}
                  >
                    {isAddingWaypoint ? <Cross2Icon /> : <PlusIcon />}{' '}
                    {isAddingWaypoint ? 'Cancel adding' : 'Add on map'}
                  </Button>
                  <Button
                    ref={savedPlaceTriggerRef}
                    className="secondary"
                    type="button"
                    onClick={() => setIsFavoritesOpen(true)}
                  >
                    <PlusIcon /> Saved place
                  </Button>
                  <Button
                    className="secondary"
                    type="button"
                    onClick={() => setCoordinateDialog({ kind: 'add' })}
                  >
                    <PlusIcon /> Coordinates
                  </Button>
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

              <RoutePathGuidance
                canUseMap={canUseMap}
                places={places}
                waypoints={draft.waypoints}
              />

              {selectedWaypoint == null ? (
                <div className="selected-waypoint-empty">
                  <strong>No waypoint selected</strong>
                  <span className="muted">
                    {canUseMap
                      ? 'Choose Edit points, or select from the list below.'
                      : 'Select from the list below to edit exact coordinates.'}
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
                </section>
              )}

              {canCloseLoop ? (
                <div className="close-loop-callout">
                  <span>
                    Loop will jump from the last waypoint to the first. Add the return segment for
                    continuous movement.
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
                  <Toggle value="ONCE">Once</Toggle>
                  <Toggle value="LOOP">Loop</Toggle>
                  <Toggle value="PING_PONG">Ping-pong</Toggle>
                </ToggleGroup>
              </div>
            </section>
          </Tabs.Content>
        </Tabs.Root>

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

        <section className="route-save-use-section" aria-labelledby="route-save-use-heading">
          <div>
            <h3 id="route-save-use-heading">
              {section === 'playback' ? 'Save & use' : 'Save & share'}
            </h3>
            <p className="muted no-margin">
              {section === 'playback'
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
                {section === 'playback' ? (
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
        restoreFocusElement={savedPlaceTriggerRef.current}
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
        confirmLabel="Delete route"
        description="This cannot be undone. The route, its revisions, and its public share link will be permanently removed."
        open={isDeleteOpen}
        restoreFocusElement={moreTriggerRef.current}
        title={`Delete “${route?.name ?? draft.name}”?`}
        onConfirm={async () => {
          await onDelete?.();
          setIsDeleteOpen(false);
        }}
        onOpenChange={setIsDeleteOpen}
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
            draggable
            key={waypoint.draftId}
            ref={(element) => {
              waypointRowRefs.current[index] = element;
            }}
            onDragEnd={() => {
              setDraggedWaypointIndex(null);
              setDragOverWaypointIndex(null);
            }}
            onDragEnter={() => setDragOverWaypointIndex(index)}
            onDragOver={(event) => event.preventDefault()}
            onDragStart={(event) => {
              setDraggedWaypointIndex(index);
              event.dataTransfer.effectAllowed = 'move';
              event.dataTransfer.setData('text/plain', String(index));
            }}
            onDrop={(event) => {
              event.preventDefault();
              const fromIndex = Number(event.dataTransfer.getData('text/plain'));
              if (Number.isInteger(fromIndex)) {
                onMove(fromIndex, index);
              }
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
              <Menu.Item className="ui-menu-item danger" onClick={() => onRemove(waypoint, index)}>
                Remove from route
              </Menu.Item>
            </MenuSurface>
          </li>
        );
      })}
    </ul>
  );
}

function WaypointCoordinateDialog({
  onOpenChange,
  onSave,
  state,
}: {
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
    if (!Number.isFinite(nextLatitude) || nextLatitude < -90 || nextLatitude > 90) {
      setError('Latitude must be a number between -90 and 90.');
      return;
    }
    if (!Number.isFinite(nextLongitude) || nextLongitude < -180 || nextLongitude > 180) {
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
