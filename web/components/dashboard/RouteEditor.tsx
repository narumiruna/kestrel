'use client';

import {
  ArrowDownIcon,
  ArrowUpIcon,
  Cross2Icon,
  DotsHorizontalIcon,
  Pencil1Icon,
  PlusIcon,
  ResetIcon,
  ResumeIcon,
} from '@radix-ui/react-icons';
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
import {
  formatError,
  formatMode,
  formatRouteDistanceFromWaypoints,
} from '@/components/dashboard/utils';
import {
  Button,
  CheckboxField,
  ConfirmDialog,
  DialogFrame,
  Disclosure,
  Menu,
  MenuSurface,
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
  onSave: (input: RouteInput) => Promise<void> | void;
  onSelectedWaypointIndexChange?: (index: number | null) => void;
  places?: Place[];
  placesError?: string | null;
  route: Route | null;
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
  onSelectedWaypointIndexChange,
  places = [],
  placesError = null,
  route,
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
  const [isManageOpen, setIsManageOpen] = useState(false);
  const [isMoreDetailsOpen, setIsMoreDetailsOpen] = useState(route == null);
  const [isSaving, setIsSaving] = useState(false);
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const moreTriggerRef = useRef<HTMLButtonElement | null>(null);
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

  useEffect(() => {
    if (selectedWaypointIndex != null && selectedWaypointIndex >= draft.waypoints.length) {
      onSelectedWaypointIndexChange?.(null);
    }
  }, [draft.waypoints.length, onSelectedWaypointIndexChange, selectedWaypointIndex]);

  useEffect(() => {
    if (!isManageOpen || selectedWaypointIndex == null) {
      return;
    }
    waypointRowRefs.current[selectedWaypointIndex]?.scrollIntoView({ block: 'nearest' });
  }, [isManageOpen, selectedWaypointIndex]);

  function updateState(transform: (state: RouteDraftState) => RouteDraftState) {
    setDraftState((current) => transform(current));
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
    updateState((state) =>
      addRouteWaypoint(state, { latitude: place.latitude, longitude: place.longitude }),
    );
    const index = draft.waypoints.length;
    onSelectedWaypointIndexChange?.(index);
    onFocusTargetChange?.({ latitude: place.latitude, longitude: place.longitude });
  }

  function selectWaypoint(waypoint: RouteDraftWaypoint, index: number) {
    onSelectedWaypointIndexChange?.(index);
    onFocusTargetChange?.(waypoint);
  }

  function moveWaypoint(fromIndex: number, toIndex: number) {
    updateState((state) => moveRouteWaypoint(state, fromIndex, toIndex));
    onSelectedWaypointIndexChange?.(toIndex);
  }

  function removeWaypoint(waypoint: RouteDraftWaypoint, index: number) {
    updateState((state) => removeRouteWaypoint(state, waypoint.draftId));
    const nextLength = draft.waypoints.length - 1;
    if (nextLength === 0) {
      onSelectedWaypointIndexChange?.(null);
    } else {
      onSelectedWaypointIndexChange?.(Math.min(index, nextLength - 1));
    }
  }

  function insertAfter(_waypoint: RouteDraftWaypoint, index: number) {
    updateState((state) => insertRouteWaypointAfter(state, index));
    onSelectedWaypointIndexChange?.(index + 1);
  }

  return (
    <form className="panel route-editor route-editor-redesign" onSubmit={submit}>
      <div className="route-editor-content">
        {error == null ? null : (
          <div className="error route-editor-error" role="alert">
            {error}
          </div>
        )}

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
                  More
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
            <span>{draft.defaultSpeedKmh || '—'} km/h</span>
            <span>{formatMode(draft.mode)}</span>
            {route?.currentRevision == null ? null : (
              <span>Revision {route.currentRevision.revisionNumber}</span>
            )}
          </section>
          <div className="route-context-actions">
            <RouteRemoteControlAction
              isDirty={isDirty}
              mode={draft.mode}
              route={route}
              speedKmh={Number(draft.defaultSpeedKmh)}
              waypoints={draft.waypoints}
            />
            <Button
              ref={shareTriggerRef}
              aria-haspopup="dialog"
              className="secondary"
              disabled={route == null}
              type="button"
              onClick={() => setIsShareDialogOpen(true)}
            >
              Share
            </Button>
          </div>
        </section>

        <section className="route-path-section" aria-labelledby="route-path-heading">
          <div className="route-section-heading">
            <div>
              <h3 id="route-path-heading">Path</h3>
              <p className="muted no-margin">
                Click the map, choose a saved place, or enter exact coordinates.
              </p>
            </div>
          </div>
          <fieldset className="route-path-toolbar">
            <legend className="sr-only">Path editing actions</legend>
            <Button className="secondary" type="button" onClick={() => setIsFavoritesOpen(true)}>
              <PlusIcon /> Saved place
            </Button>
            <Button
              className="secondary"
              type="button"
              onClick={() => setCoordinateDialog({ kind: 'add' })}
            >
              <PlusIcon /> Coordinates
            </Button>
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

          <RouteRail places={places} waypoints={draft.waypoints} />

          {selectedWaypoint == null ? (
            <div className="selected-waypoint-empty">
              <strong>No waypoint selected</strong>
              <span className="muted">Choose a numbered marker to edit one point precisely.</span>
            </div>
          ) : (
            <section
              className="selected-waypoint-card"
              aria-label={`Selected waypoint ${selectedWaypointNumber}`}
            >
              <div>
                <span className={getWaypointBadgeClassName(selectedIndex, draft.waypoints.length)}>
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
                  aria-label="Move selected waypoint up"
                  className="secondary"
                  disabled={selectedWaypointIndex === 0}
                  type="button"
                  onClick={() => moveWaypoint(selectedIndex, selectedIndex - 1)}
                >
                  <ArrowUpIcon />
                </Button>
                <Button
                  aria-label="Move selected waypoint down"
                  className="secondary"
                  disabled={selectedWaypointIndex === draft.waypoints.length - 1}
                  type="button"
                  onClick={() => moveWaypoint(selectedIndex, selectedIndex + 1)}
                >
                  <ArrowDownIcon />
                </Button>
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
                <Button
                  aria-label="Remove selected waypoint"
                  className="danger"
                  type="button"
                  onClick={() => removeWaypoint(selectedWaypoint, selectedIndex)}
                >
                  <Cross2Icon /> Remove
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
            summary={
              <>
                <span>Manage all {draft.waypoints.length} waypoints</span>
                <span className="muted">Reorder, duplicate, edit, or remove</span>
              </>
            }
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

          <Disclosure
            className="route-editor-collapsible route-saved-places-disclosure"
            open={isFavoritesOpen}
            summary={
              <>
                <span>Add from saved places</span>
                <span className="muted">Search your cloud library</span>
              </>
            }
            onOpenChange={setIsFavoritesOpen}
          >
            <div className="route-editor-collapsible-content">
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
            </div>
          </Disclosure>
        </section>

        <section className="route-playback-section" aria-labelledby="route-playback-heading">
          <div>
            <h3 id="route-playback-heading">Playback</h3>
            <p className="muted no-margin">Choose how Android moves through this path.</p>
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
              value={[draft.mode]}
              onValueChange={(values) => {
                const mode = values.at(-1) as RouteMode | undefined;
                if (mode != null) {
                  updateState((state) => setRouteDraftField(state, 'mode', mode));
                }
              }}
            >
              <Toggle value="ONCE">Once</Toggle>
              <Toggle value="LOOP">Loop</Toggle>
              <Toggle value="PING_PONG">Ping-pong</Toggle>
            </ToggleGroup>
          </div>
        </section>

        <Disclosure
          className="route-editor-collapsible route-more-details-disclosure"
          open={isMoreDetailsOpen}
          summary={
            <>
              <span>More details</span>
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
      </div>

      <footer className="route-editor-footer">
        <div className="route-save-status" aria-live="polite">
          {isDirty ? (
            <>
              <strong>Unsaved changes</strong>
              <span>{changes.join(' · ') || 'Route changed'}</span>
            </>
          ) : saveNotice == null ? (
            <span>All changes saved.</span>
          ) : (
            <strong>{saveNotice}</strong>
          )}
          {validation.saveDisabledReason == null ? null : (
            <span>{validation.saveDisabledReason}</span>
          )}
        </div>
        <div className="route-editor-save-buttons">
          {isDirty ? (
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
          <Button disabled={isSaving || !validation.isValid || !isDirty} type="submit">
            {isSaving ? 'Saving…' : 'Save route'}
          </Button>
        </div>
      </footer>

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
            onSelectedWaypointIndexChange?.(coordinateDialog.index);
          } else {
            updateState((state) => addRouteWaypoint(state, nextWaypoint));
            onSelectedWaypointIndexChange?.(draft.waypoints.length);
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

function RouteRail({ places, waypoints }: { places: Place[]; waypoints: RouteDraftWaypoint[] }) {
  const first = waypoints[0];
  const last = waypoints.at(-1);

  if (first == null) {
    return (
      <div className="route-rail route-rail-empty">
        <span className="route-rail-node" />
        <span>
          <strong>Start on the map</strong>
          <small>Add at least two waypoints to save a route.</small>
        </span>
      </div>
    );
  }

  return (
    <section className="route-rail" aria-label="Route path summary">
      <span className="route-rail-node is-start" />
      <span className="route-rail-label">
        <small>Start</small>
        <strong>{formatWaypointName(first, places, 'Waypoint 1')}</strong>
      </span>
      <span className="route-rail-line" />
      <span className="route-rail-intermediate">
        {waypoints.length <= 2 ? 'Direct' : `${waypoints.length - 2} intermediate`}
      </span>
      <span className="route-rail-line" />
      <span className="route-rail-node is-end" />
      <span className="route-rail-label">
        <small>End</small>
        <strong>
          {last == null
            ? 'Add another waypoint'
            : formatWaypointName(last, places, `Waypoint ${waypoints.length}`)}
        </strong>
      </span>
    </section>
  );
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
