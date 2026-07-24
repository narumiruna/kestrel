'use client';

import dynamic from 'next/dynamic';
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FavoriteWaypointPicker } from '@/components/dashboard/FavoriteWaypointPicker';
import { RouteRemoteControlAction } from '@/components/dashboard/RemoteControlPanel';
import { RouteSharePanel } from '@/components/dashboard/RouteSharePanel';
import {
  formatWaypointCoords,
  formatWaypointName,
  formatWaypointSummary,
  getRouteBaseline,
  getRouteBuilderHint,
  getSaveDisabledReason,
  getWaypointBadgeClassName,
  getWaypointKey,
  isRouteDraftEqual,
  moveWaypoint,
} from '@/components/dashboard/routeEditorUtils';
import {
  formatError,
  formatMode,
  formatRouteDistanceFromWaypoints,
  normalizeNullable,
  parseNumber,
} from '@/components/dashboard/utils';
import {
  Button,
  CheckboxField,
  ConfirmDialog,
  DialogFrame,
  Disclosure,
  Menu,
  MenuSurface,
  SelectField,
  TextArea,
  TextInput,
} from '@/components/ui/radix-ui';
import type { Place, Route, RouteInput, RouteMode, RouteWaypoint } from '@/lib/api';

const RouteMapEditor = dynamic(() => import('@/components/RouteMapEditor'), {
  ssr: false,
});

export default function RouteEditor({
  compactSummary = false,
  mapMode = 'embedded',
  onBeforeNavigateAway,
  onDelete,
  onDirtyChange,
  onFocusTargetChange,
  onHoverWaypointIndexChange,
  onSave,
  onSelectedWaypointIndexChange,
  onWaypointsChange,
  places = [],
  route,
  selectedWaypointIndex: controlledSelectedWaypointIndex,
  hoveredWaypointIndex = null,
  waypoints: controlledWaypoints,
}: {
  compactSummary?: boolean;
  mapMode?: 'background' | 'embedded';
  onBeforeNavigateAway?: () => boolean;
  onDelete?: () => void;
  onDirtyChange?: (isDirty: boolean) => void;
  onFocusTargetChange?: (waypoint: RouteWaypoint | null) => void;
  onHoverWaypointIndexChange?: (index: number | null) => void;
  onSave: (input: RouteInput) => void;
  onSelectedWaypointIndexChange?: (index: number | null) => void;
  onWaypointsChange?: (waypoints: RouteWaypoint[]) => void;
  places?: Place[];
  route: Route | null;
  selectedWaypointIndex?: number | null;
  hoveredWaypointIndex?: number | null;
  waypoints?: RouteWaypoint[];
}) {
  const [name, setName] = useState(route?.name ?? '');
  const [description, setDescription] = useState(route?.description ?? '');
  const [defaultSpeedKmh, setDefaultSpeedKmh] = useState(route?.defaultSpeedKmh.toString() ?? '5');
  const [mode, setMode] = useState<RouteMode>(route?.mode ?? 'ONCE');
  const [isPublic, setIsPublic] = useState(route?.isPublic ?? false);
  const [internalWaypoints, setInternalWaypoints] = useState<RouteWaypoint[]>(
    route?.currentRevision?.waypoints.map((waypoint) => ({
      latitude: waypoint.latitude,
      longitude: waypoint.longitude,
    })) ?? [],
  );
  const [fitRequest, setFitRequest] = useState(0);
  const [focusTarget, setFocusTarget] = useState<RouteWaypoint | null>(null);
  const [draggedWaypointIndex, setDraggedWaypointIndex] = useState<number | null>(null);
  const [dragOverWaypointIndex, setDragOverWaypointIndex] = useState<number | null>(null);
  const [internalSelectedWaypointIndex, setInternalSelectedWaypointIndex] = useState<number | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const [isFavoritesOpen, setIsFavoritesOpen] = useState(route == null);
  const [isRouteSettingsOpen, setIsRouteSettingsOpen] = useState(route == null);
  const [editingWaypointIndex, setEditingWaypointIndex] = useState<number | null>(null);
  const [invalidSettingsField, setInvalidSettingsField] = useState<'name' | 'speed' | null>(null);
  const saveNoticeTimeoutRef = useRef<number | null>(null);
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const speedInputRef = useRef<HTMLInputElement | null>(null);
  const shareTriggerRef = useRef<HTMLButtonElement | null>(null);
  const onDirtyChangeRef = useRef(onDirtyChange);
  const waypointRowRefs = useRef<Array<HTMLLIElement | null>>([]);
  const waypoints = controlledWaypoints ?? internalWaypoints;
  const [isWaypointsOpen, setIsWaypointsOpen] = useState(waypoints.length > 0);
  const selectedWaypointIndex =
    controlledSelectedWaypointIndex === undefined
      ? internalSelectedWaypointIndex
      : controlledSelectedWaypointIndex;
  const setWaypoints = onWaypointsChange ?? setInternalWaypoints;
  const isBackgroundMapMode = mapMode === 'background';
  const routeBuilderHint = getRouteBuilderHint(waypoints.length, places.length, mapMode);
  const saveDisabledReason = getSaveDisabledReason(waypoints.length);
  const favoritePickerMode = waypoints.length === 0 ? 'start' : 'append';
  const baseline = useMemo(() => getRouteBaseline(route), [route]);
  const isDirty = useMemo(
    () =>
      !isRouteDraftEqual(
        {
          defaultSpeedKmh,
          description,
          isPublic,
          mode,
          name,
          waypoints,
        },
        baseline,
      ),
    [baseline, defaultSpeedKmh, description, isPublic, mode, name, waypoints],
  );
  const revisionLabel =
    route?.currentRevision == null ? 'Draft' : `Revision ${route.currentRevision.revisionNumber}`;
  const distanceLabel = useMemo(() => formatRouteDistanceFromWaypoints(waypoints), [waypoints]);

  const setSelectedWaypointIndex = useCallback(
    (nextIndex: number | null) => {
      setInternalSelectedWaypointIndex(nextIndex);
      onSelectedWaypointIndexChange?.(nextIndex);
    },
    [onSelectedWaypointIndexChange],
  );

  const setRouteFocusTarget = useCallback(
    (nextFocusTarget: RouteWaypoint | null) => {
      setFocusTarget(nextFocusTarget);
      onFocusTargetChange?.(nextFocusTarget);
    },
    [onFocusTargetChange],
  );

  useEffect(() => {
    if (selectedWaypointIndex != null && selectedWaypointIndex >= waypoints.length) {
      setSelectedWaypointIndex(null);
    }
  }, [selectedWaypointIndex, setSelectedWaypointIndex, waypoints.length]);

  useEffect(() => {
    if (waypoints.length > 0) {
      setIsWaypointsOpen(true);
    }
  }, [waypoints.length]);

  useEffect(() => {
    if (!isRouteSettingsOpen || invalidSettingsField == null) {
      return;
    }

    const animationFrame = window.requestAnimationFrame(() => {
      const input = invalidSettingsField === 'name' ? nameInputRef.current : speedInputRef.current;
      input?.focus();
      setInvalidSettingsField(null);
    });
    return () => window.cancelAnimationFrame(animationFrame);
  }, [invalidSettingsField, isRouteSettingsOpen]);

  useEffect(() => {
    onDirtyChangeRef.current = onDirtyChange;
  }, [onDirtyChange]);

  useEffect(() => {
    if (selectedWaypointIndex == null) {
      return;
    }

    waypointRowRefs.current[selectedWaypointIndex]?.scrollIntoView({
      block: 'nearest',
    });
  }, [selectedWaypointIndex]);

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
    setRouteFocusTarget(waypoint);
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

  function moveWaypointTo(index: number, nextIndex: number) {
    if (nextIndex < 0 || nextIndex >= waypoints.length || index === nextIndex) {
      return;
    }

    moveWaypoint(waypoints, setWaypoints, index, nextIndex);
    setSelectedWaypointIndex(nextIndex);
  }

  function insertWaypointAfter(index: number) {
    const waypoint = waypoints[index];

    if (waypoint == null) {
      return;
    }

    const nextWaypoints = [...waypoints];
    nextWaypoints.splice(index + 1, 0, waypoint);
    setWaypoints(nextWaypoints);
    setSelectedWaypointIndex(index + 1);
  }

  function editWaypointCoordinates(index: number) {
    if (waypoints[index] != null) {
      setEditingWaypointIndex(index);
    }
  }

  function saveWaypointCoordinates(index: number, waypoint: RouteWaypoint) {
    setWaypoints(
      waypoints.map((currentWaypoint, currentIndex) =>
        currentIndex === index ? { ...currentWaypoint, ...waypoint } : currentWaypoint,
      ),
    );
    setRouteFocusTarget(waypoint);
    setEditingWaypointIndex(null);
  }

  function removeWaypoint(index: number) {
    setWaypoints(waypoints.filter((_, currentIndex) => currentIndex !== index));

    if (selectedWaypointIndex == null || selectedWaypointIndex === index) {
      setSelectedWaypointIndex(null);
      return;
    }

    setSelectedWaypointIndex(
      selectedWaypointIndex > index ? selectedWaypointIndex - 1 : selectedWaypointIndex,
    );
  }

  function focusWaypoint(waypoint: RouteWaypoint, index: number) {
    setSelectedWaypointIndex(index);
    setRouteFocusTarget(waypoint);
  }

  function discardChanges() {
    setName(baseline.name);
    setDescription(baseline.description);
    setDefaultSpeedKmh(baseline.defaultSpeedKmh);
    setMode(baseline.mode);
    setIsPublic(baseline.isPublic);
    setWaypoints(baseline.waypoints);
    setSelectedWaypointIndex(null);
    setRouteFocusTarget(null);
    setError(null);
    setSaveNotice(null);
  }

  const routeSettingsFields = (
    <>
      <label
        htmlFor="radix-field-components-dashboard-routeeditor-tsx-1"
        className="route-title-field"
      >
        Name
        <TextInput
          id="radix-field-components-dashboard-routeeditor-tsx-1"
          ref={nameInputRef}
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
          onInvalid={() => setIsRouteSettingsOpen(true)}
        />
      </label>
      <div className="split">
        <label htmlFor="radix-field-components-dashboard-routeeditor-tsx-2">
          Default speed (km/h)
          <TextInput
            id="radix-field-components-dashboard-routeeditor-tsx-2"
            ref={speedInputRef}
            required
            inputMode="decimal"
            value={defaultSpeedKmh}
            onChange={(event) => setDefaultSpeedKmh(event.target.value)}
            onInvalid={() => setIsRouteSettingsOpen(true)}
          />
        </label>
        <SelectField
          label="Playback mode"
          options={[
            { label: 'Once', value: 'ONCE' },
            { label: 'Loop', value: 'LOOP' },
            { label: 'Ping-pong', value: 'PING_PONG' },
          ]}
          value={mode}
          onValueChange={setMode}
        />
      </div>
      {compactSummary ? (
        <Disclosure className="editor-more-details" summary="More details">
          <label htmlFor="radix-field-components-dashboard-routeeditor-tsx-3">
            Description (optional)
            <TextArea
              id="radix-field-components-dashboard-routeeditor-tsx-3"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>
        </Disclosure>
      ) : (
        <label htmlFor="radix-field-components-dashboard-routeeditor-tsx-4">
          Description (optional)
          <TextArea
            id="radix-field-components-dashboard-routeeditor-tsx-4"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </label>
      )}
    </>
  );

  const routeSettingsDisclosure = (
    <Disclosure
      className="route-editor-section route-editor-collapsible route-editor-details-section route-settings-disclosure"
      open={isRouteSettingsOpen}
      summary={
        <>
          <span>Route settings</span>
          <span className="muted">
            {name || 'Name'} · {defaultSpeedKmh || '—'} km/h · {formatMode(mode)}
          </span>
        </>
      }
      onOpenChange={setIsRouteSettingsOpen}
    >
      <div className="route-editor-collapsible-content">{routeSettingsFields}</div>
    </Disclosure>
  );
  const favoritesDisclosure = (
    <Disclosure
      className="route-editor-section route-editor-collapsible route-add-from-favorites"
      open={isFavoritesOpen}
      summary={
        <>
          <span>Add from saved places</span>
          <span className="muted">Or click the map</span>
        </>
      }
      onOpenChange={setIsFavoritesOpen}
    >
      <div className="route-editor-collapsible-content">
        <FavoriteWaypointPicker
          mode={favoritePickerMode}
          places={places}
          showHeading={false}
          onBeforeNavigate={onBeforeNavigateAway}
          onSelect={addFavoriteWaypoint}
        />
      </div>
    </Disclosure>
  );

  return (
    <form
      className={`panel route-editor${compactSummary ? ' route-editor-compact' : ''}`}
      onSubmit={submit}
    >
      {isBackgroundMapMode ? null : (
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
      )}
      <div className="route-editor-content">
        {error == null ? null : (
          <div className="error route-editor-error" role="alert">
            {error}
          </div>
        )}

        {compactSummary ? (
          <section className="route-compact-status" aria-label="Route status">
            <p>
              <strong>{waypoints.length}</strong> pins · <strong>{distanceLabel}</strong>
            </p>
            {route == null ? null : (
              <div className="route-compact-actions">
                <RouteRemoteControlAction
                  mode={mode}
                  route={route}
                  speedKmh={Number(defaultSpeedKmh)}
                  waypoints={waypoints}
                />
                <Button
                  aria-haspopup="dialog"
                  className="secondary route-share-action"
                  type="button"
                  onClick={(event) => {
                    shareTriggerRef.current = event.currentTarget;
                    setIsShareDialogOpen(true);
                  }}
                >
                  Share
                </Button>
              </div>
            )}
          </section>
        ) : (
          <section className="route-editor-section route-summary-section">
            <div className="route-section-heading">
              <div className="route-section-title">
                <h3>Route summary</h3>
                <span className="chip rev-chip">{revisionLabel}</span>
              </div>
              <RouteRemoteControlAction
                mode={mode}
                route={route}
                speedKmh={Number(defaultSpeedKmh)}
                waypoints={waypoints}
              />
            </div>
            <div className="route-mode-hint">
              <InfoIcon />
              <span>{routeBuilderHint}</span>
            </div>
            <div className="route-summary-grid">
              <span>
                <small>Waypoints</small>
                <strong>{waypoints.length}</strong>
              </span>
              <span>
                <small>Distance</small>
                <strong>{distanceLabel}</strong>
              </span>
              <span>
                <small>Speed</small>
                <strong>{defaultSpeedKmh || '—'} km/h</strong>
              </span>
              <span>
                <small>Mode</small>
                <strong>{formatMode(mode)}</strong>
              </span>
            </div>
          </section>
        )}

        {compactSummary ? null : (
          <Disclosure
            className="route-editor-section route-editor-collapsible route-editor-details-section"
            defaultOpen
            summary={
              <>
                <span>Route settings</span>
                <span className="muted">Name, speed, and playback</span>
              </>
            }
          >
            <div className="route-editor-collapsible-content">{routeSettingsFields}</div>
          </Disclosure>
        )}

        {compactSummary ? null : (
          <Disclosure
            className="route-editor-section route-editor-collapsible route-editor-map-section"
            defaultOpen={waypoints.length === 0}
            summary={
              <>
                <span>Add waypoints</span>
                <span className="muted">Map clicks or saved places</span>
              </>
            }
          >
            <div className="route-editor-collapsible-content">
              {isBackgroundMapMode ? null : (
                <>
                  <div>
                    <h3>Route builder</h3>
                    <p className="muted">Add pins on the map or pick from saved places.</p>
                  </div>
                  <div className="route-builder-hint">
                    <InfoIcon />
                    {routeBuilderHint}
                  </div>
                </>
              )}
              {mapMode === 'embedded' ? (
                <>
                  <div className="map-builder">
                    <RouteMapEditor
                      fitRequest={fitRequest}
                      focusTarget={focusTarget}
                      selectedWaypointIndex={selectedWaypointIndex}
                      waypoints={waypoints}
                      onChange={setWaypoints}
                      onSelectWaypoint={setSelectedWaypointIndex}
                    />
                    <div className="map-instruction">
                      Click map to add waypoint · Drag markers to adjust
                    </div>
                  </div>
                  <div className="map-action-row">
                    <Button
                      className="secondary"
                      disabled={waypoints.length === 0}
                      title="Auto-frame the map to show all waypoints"
                      type="button"
                      onClick={() => setFitRequest((currentRequest) => currentRequest + 1)}
                    >
                      Fit route
                    </Button>
                    <span className="muted">
                      Use Waypoints below to review, reorder, or edit pins.
                    </span>
                  </div>
                </>
              ) : null}

              <FavoriteWaypointPicker
                mode={favoritePickerMode}
                places={places}
                onBeforeNavigate={onBeforeNavigateAway}
                onSelect={addFavoriteWaypoint}
              />
            </div>
          </Disclosure>
        )}

        <Disclosure
          className="route-editor-section route-editor-collapsible route-editor-waypoints-section"
          open={isWaypointsOpen}
          summary={
            <>
              <span>Waypoints ({waypoints.length})</span>
              <span className="muted">{formatWaypointSummary(waypoints, places)}</span>
            </>
          }
          onOpenChange={setIsWaypointsOpen}
        >
          <div className="route-editor-collapsible-content">
            {waypoints.length === 0 ? (
              <div className="waypoint-empty-state">
                <MapPinIcon />
                <strong>No waypoints yet</strong>
                <span className="muted">
                  Click the map to add your first waypoint, or pick from saved places nearby.
                </span>
              </div>
            ) : (
              <ul className="waypoint-list" aria-label="Route waypoints">
                {waypoints.map((waypoint, index) => {
                  const waypointName = formatWaypointName(waypoint, places, `Pin ${index + 1}`);

                  const waypointRowClassName = [
                    'waypoint-row',
                    selectedWaypointIndex === index ? 'selected' : '',
                    hoveredWaypointIndex === index ? 'hovered' : '',
                    draggedWaypointIndex === index ? 'is-dragging' : '',
                    dragOverWaypointIndex === index && draggedWaypointIndex !== index
                      ? 'is-drop-target'
                      : '',
                  ]
                    .filter(Boolean)
                    .join(' ');

                  return (
                    <li
                      aria-current={selectedWaypointIndex === index ? 'true' : undefined}
                      className={waypointRowClassName}
                      draggable
                      key={getWaypointKey(waypoint, index)}
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
                      onBlurCapture={(event) => {
                        const nextFocusTarget = event.relatedTarget;

                        if (
                          nextFocusTarget instanceof Node &&
                          event.currentTarget.contains(nextFocusTarget)
                        ) {
                          return;
                        }

                        onHoverWaypointIndexChange?.(null);
                      }}
                      onFocusCapture={() => onHoverWaypointIndexChange?.(index)}
                      onMouseEnter={() => onHoverWaypointIndexChange?.(index)}
                      onMouseLeave={() => onHoverWaypointIndexChange?.(null)}
                      onDrop={(event) => {
                        event.preventDefault();
                        const fromIndex = Number(event.dataTransfer.getData('text/plain'));

                        if (Number.isInteger(fromIndex) && fromIndex !== index) {
                          moveWaypoint(waypoints, setWaypoints, fromIndex, index);
                          setSelectedWaypointIndex(index);
                        }

                        setDraggedWaypointIndex(null);
                        setDragOverWaypointIndex(null);
                      }}
                    >
                      <Button
                        className="waypoint-focus"
                        type="button"
                        onClick={() => focusWaypoint(waypoint, index)}
                      >
                        <span className="waypoint-grip" title="Drag to reorder">
                          <GripVerticalIcon />
                        </span>
                        <span className={getWaypointBadgeClassName(index, waypoints.length)}>
                          {index === waypoints.length - 1 && waypoints.length > 1 ? (
                            <FlagIcon />
                          ) : (
                            index + 1
                          )}
                        </span>
                        <span className="waypoint-main">
                          <span className="waypoint-name" title={waypointName}>
                            {waypointName}
                          </span>
                          <span className="waypoint-coordinates mono">
                            {formatWaypointCoords(waypoint)}
                          </span>
                        </span>
                      </Button>
                      <MenuSurface
                        className="waypoint-menu-content"
                        trigger={
                          <Button
                            aria-label={`More options for ${waypointName}`}
                            className="waypoint-menu-trigger"
                            type="button"
                          >
                            <MoreHorizontalIcon />
                          </Button>
                        }
                      >
                        <Menu.Item
                          className="ui-menu-item"
                          disabled={index === 0}
                          onClick={() => moveWaypointTo(index, index - 1)}
                        >
                          Move up
                        </Menu.Item>
                        <Menu.Item
                          className="ui-menu-item"
                          disabled={index === waypoints.length - 1}
                          onClick={() => moveWaypointTo(index, index + 1)}
                        >
                          Move down
                        </Menu.Item>
                        <Menu.Item
                          className="ui-menu-item"
                          onClick={() => insertWaypointAfter(index)}
                        >
                          Insert pin after
                        </Menu.Item>
                        <Menu.Item
                          className="ui-menu-item"
                          onClick={() => editWaypointCoordinates(index)}
                        >
                          Edit coordinates
                        </Menu.Item>
                        <Menu.Separator className="ui-menu-separator" />
                        <Menu.Item
                          className="ui-menu-item danger"
                          onClick={() => removeWaypoint(index)}
                        >
                          Remove from route
                        </Menu.Item>
                      </MenuSurface>
                    </li>
                  );
                })}
              </ul>
            )}
            <Button
              className="secondary button-icon-label"
              disabled={waypoints.length === 0}
              type="button"
              onClick={duplicateLastWaypoint}
            >
              <PlusIcon />
              Duplicate last waypoint
            </Button>
          </div>
        </Disclosure>

        {compactSummary ? (
          route == null ? (
            <>
              {routeSettingsDisclosure}
              {favoritesDisclosure}
            </>
          ) : (
            <>
              {favoritesDisclosure}
              {routeSettingsDisclosure}
            </>
          )
        ) : null}
      </div>

      <footer className="route-editor-footer">
        <div className="route-editor-footer-actions">
          <div className="route-danger-zone">
            {onDelete == null ? null : (
              <ConfirmDialog
                confirmLabel="Delete route"
                description="This cannot be undone. The route, revisions, and public share link will be permanently removed."
                disabled={isSaving}
                title="Delete this route?"
                trigger={
                  <Button className="danger" disabled={isSaving} type="button">
                    Delete route
                  </Button>
                }
                onConfirm={onDelete}
              />
            )}
          </div>
          <div className="route-save-actions">
            {isDirty ? <span className="unsaved-changes-label">Unsaved changes</span> : null}
            {saveDisabledReason == null ? null : (
              <p className="muted no-margin">{saveDisabledReason}</p>
            )}
            <div className="route-editor-save-buttons">
              {isDirty ? (
                <Button
                  className="secondary"
                  disabled={isSaving}
                  type="button"
                  onClick={discardChanges}
                >
                  Discard changes
                </Button>
              ) : null}
              {route == null || compactSummary ? null : (
                <Button
                  aria-haspopup="dialog"
                  className="secondary"
                  type="button"
                  onClick={(event) => {
                    shareTriggerRef.current = event.currentTarget;
                    setIsShareDialogOpen(true);
                  }}
                >
                  Share
                </Button>
              )}
              <Button
                className={isSaving ? 'is-loading' : saveNotice == null ? '' : 'is-saved'}
                disabled={isSaving || saveDisabledReason != null}
                type="submit"
                onClick={() => {
                  const nextInvalidField =
                    name.trim().length === 0
                      ? 'name'
                      : defaultSpeedKmh.trim().length === 0
                        ? 'speed'
                        : null;
                  if (nextInvalidField != null) {
                    setInvalidSettingsField(nextInvalidField);
                    setIsRouteSettingsOpen(true);
                  }
                }}
              >
                {isSaving ? 'Saving…' : saveNotice == null ? 'Save route' : 'Saved ✓'}
              </Button>
            </div>
          </div>
        </div>
      </footer>
      <DialogFrame
        className="place-action-dialog-card"
        eyebrow="secondary action"
        open={isShareDialogOpen}
        restoreFocusElement={shareTriggerRef.current}
        title="Share route"
        onOpenChange={setIsShareDialogOpen}
      >
        <CheckboxField checked={isPublic} onCheckedChange={setIsPublic}>
          Public route
        </CheckboxField>
        <RouteSharePanel route={route} />
      </DialogFrame>
      <WaypointCoordinateDialog
        index={editingWaypointIndex}
        waypoint={editingWaypointIndex == null ? null : (waypoints[editingWaypointIndex] ?? null)}
        onOpenChange={(open) => {
          if (!open) {
            setEditingWaypointIndex(null);
          }
        }}
        onSave={saveWaypointCoordinates}
      />
    </form>
  );
}

function WaypointCoordinateDialog({
  index,
  onOpenChange,
  onSave,
  waypoint,
}: {
  index: number | null;
  onOpenChange: (open: boolean) => void;
  onSave: (index: number, waypoint: RouteWaypoint) => void;
  waypoint: RouteWaypoint | null;
}) {
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (waypoint == null) {
      return;
    }

    setLatitude(waypoint.latitude.toFixed(6));
    setLongitude(waypoint.longitude.toFixed(6));
    setError(null);
  }, [waypoint]);

  function submitCoordinates(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (index == null) {
      return;
    }

    const nextLatitude = Number(latitude.trim());
    const nextLongitude = Number(longitude.trim());
    if (!Number.isFinite(nextLatitude) || !Number.isFinite(nextLongitude)) {
      setError('Enter valid numeric latitude and longitude values.');
      return;
    }

    onSave(index, { latitude: nextLatitude, longitude: nextLongitude });
  }

  return (
    <DialogFrame
      description="Enter exact coordinates for this route pin."
      eyebrow="Waypoint"
      open={waypoint != null}
      title={index == null ? 'Edit coordinates' : `Edit pin ${index + 1}`}
      onOpenChange={onOpenChange}
    >
      <form className="stack" onSubmit={submitCoordinates}>
        {error == null ? null : (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        <div className="split">
          <label htmlFor="radix-field-components-dashboard-routeeditor-tsx-5">
            Latitude
            <TextInput
              id="radix-field-components-dashboard-routeeditor-tsx-5"
              required
              inputMode="decimal"
              value={latitude}
              onChange={(event) => setLatitude(event.target.value)}
            />
          </label>
          <label htmlFor="radix-field-components-dashboard-routeeditor-tsx-6">
            Longitude
            <TextInput
              id="radix-field-components-dashboard-routeeditor-tsx-6"
              required
              inputMode="decimal"
              value={longitude}
              onChange={(event) => setLongitude(event.target.value)}
            />
          </label>
        </div>
        <div className="ui-dialog-actions">
          <Button className="secondary" type="button" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit">Save coordinates</Button>
        </div>
      </form>
    </DialogFrame>
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

function GripVerticalIcon() {
  return (
    <svg aria-hidden="true" className="lucide-icon" fill="none" viewBox="0 0 24 24">
      <circle cx="9" cy="12" r="1" />
      <circle cx="9" cy="5" r="1" />
      <circle cx="9" cy="19" r="1" />
      <circle cx="15" cy="12" r="1" />
      <circle cx="15" cy="5" r="1" />
      <circle cx="15" cy="19" r="1" />
    </svg>
  );
}

function MoreHorizontalIcon() {
  return (
    <svg aria-hidden="true" className="lucide-icon" fill="none" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
      <circle cx="5" cy="12" r="1" />
    </svg>
  );
}

function FlagIcon() {
  return (
    <svg aria-hidden="true" className="lucide-icon" fill="none" viewBox="0 0 24 24">
      <path d="M4 22V4" />
      <path d="M4 4h12l-1 4 1 4H4" />
    </svg>
  );
}
