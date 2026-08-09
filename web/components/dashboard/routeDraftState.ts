import type { Route, RouteInput, RouteMode, RouteWaypoint } from '../../lib/api.ts';

const MAX_DESCRIPTION_LENGTH = 1024;
const MAX_HISTORY_ENTRIES = 50;
const MAX_NAME_LENGTH = 128;
const MAX_WAYPOINT_COUNT = 1000;
const MIN_WAYPOINT_COUNT = 2;

export type RouteDraftWaypoint = RouteWaypoint & {
  draftId: string;
  pauseSeconds: number | null;
  speedKmh: number | null;
};

export type RouteDraft = {
  defaultSpeedKmh: string;
  description: string;
  isPublic: boolean;
  mode: RouteMode;
  name: string;
  waypoints: RouteDraftWaypoint[];
};

export type RouteDraftState = {
  baseline: RouteDraft;
  draft: RouteDraft;
  futurePaths: RouteDraftWaypoint[][];
  nextWaypointId: number;
  pastPaths: RouteDraftWaypoint[][];
};

export type RouteValidation = {
  isValid: boolean;
  saveDisabledReason: string | null;
};

export function createRouteDraftState(route: Route | null): RouteDraftState {
  const revisionId = route?.currentRevision?.id ?? 'new';
  const waypoints =
    route?.currentRevision?.waypoints.map((waypoint, index) => ({
      draftId: `${revisionId}:${index}`,
      latitude: waypoint.latitude,
      longitude: waypoint.longitude,
      pauseSeconds: waypoint.pauseSeconds ?? null,
      speedKmh: waypoint.speedKmh ?? null,
    })) ?? [];
  const baseline: RouteDraft = {
    defaultSpeedKmh: route?.defaultSpeedKmh.toString() ?? '5',
    description: route?.description ?? '',
    isPublic: route?.isPublic ?? false,
    mode: route?.mode ?? 'ONCE',
    name: route?.name ?? '',
    waypoints,
  };

  return {
    baseline: cloneDraft(baseline),
    draft: cloneDraft(baseline),
    futurePaths: [],
    nextWaypointId: waypoints.length,
    pastPaths: [],
  };
}

export function setRouteDraftField<Key extends Exclude<keyof RouteDraft, 'waypoints'>>(
  state: RouteDraftState,
  field: Key,
  value: RouteDraft[Key],
): RouteDraftState {
  if (state.draft[field] === value) {
    return state;
  }

  return {
    ...state,
    draft: { ...state.draft, [field]: value },
  };
}

export function replaceRoutePath(
  state: RouteDraftState,
  waypoints: Array<RouteWaypoint & { draftId?: string }>,
): RouteDraftState {
  let nextWaypointId = state.nextWaypointId;
  const normalizedWaypoints = waypoints.map((waypoint) => {
    const draftId = waypoint.draftId ?? `draft-${nextWaypointId++}`;
    return {
      draftId,
      latitude: waypoint.latitude,
      longitude: waypoint.longitude,
      pauseSeconds: waypoint.pauseSeconds ?? null,
      speedKmh: waypoint.speedKmh ?? null,
    };
  });

  if (routePathsEqual(state.draft.waypoints, normalizedWaypoints)) {
    return state;
  }

  return recordPathChange(state, normalizedWaypoints, nextWaypointId);
}

export function addRouteWaypoint(state: RouteDraftState, waypoint: RouteWaypoint): RouteDraftState {
  return replaceRoutePath(state, [...state.draft.waypoints, waypoint]);
}

export function insertRouteWaypointAfter(state: RouteDraftState, index: number): RouteDraftState {
  const waypoint = state.draft.waypoints[index];
  if (waypoint == null) {
    return state;
  }

  return replaceRoutePath(state, [
    ...state.draft.waypoints.slice(0, index + 1),
    {
      latitude: waypoint.latitude,
      longitude: waypoint.longitude,
      pauseSeconds: waypoint.pauseSeconds,
      speedKmh: waypoint.speedKmh,
    },
    ...state.draft.waypoints.slice(index + 1),
  ]);
}

export function updateRouteWaypoint(
  state: RouteDraftState,
  draftId: string,
  updates: Partial<Omit<RouteDraftWaypoint, 'draftId'>>,
): RouteDraftState {
  if (!state.draft.waypoints.some((waypoint) => waypoint.draftId === draftId)) {
    return state;
  }

  return replaceRoutePath(
    state,
    state.draft.waypoints.map((waypoint) =>
      waypoint.draftId === draftId ? { ...waypoint, ...updates, draftId } : waypoint,
    ),
  );
}

export function removeRouteWaypoint(state: RouteDraftState, draftId: string): RouteDraftState {
  if (!state.draft.waypoints.some((waypoint) => waypoint.draftId === draftId)) {
    return state;
  }

  return replaceRoutePath(
    state,
    state.draft.waypoints.filter((waypoint) => waypoint.draftId !== draftId),
  );
}

export function moveRouteWaypoint(
  state: RouteDraftState,
  fromIndex: number,
  toIndex: number,
): RouteDraftState {
  if (
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= state.draft.waypoints.length ||
    toIndex >= state.draft.waypoints.length ||
    fromIndex === toIndex
  ) {
    return state;
  }

  const waypoints = [...state.draft.waypoints];
  const [waypoint] = waypoints.splice(fromIndex, 1);
  waypoints.splice(toIndex, 0, waypoint);
  return replaceRoutePath(state, waypoints);
}

export function reverseRoute(state: RouteDraftState): RouteDraftState {
  if (state.draft.waypoints.length < 2) {
    return state;
  }

  return replaceRoutePath(state, [...state.draft.waypoints].reverse());
}

export function closeRouteLoop(state: RouteDraftState): RouteDraftState {
  if (state.draft.mode !== 'LOOP' || state.draft.waypoints.length < 2) {
    return state;
  }

  const first = state.draft.waypoints[0];
  const last = state.draft.waypoints.at(-1);
  if (last != null && first.latitude === last.latitude && first.longitude === last.longitude) {
    return state;
  }

  return addRouteWaypoint(state, {
    latitude: first.latitude,
    longitude: first.longitude,
    pauseSeconds: first.pauseSeconds,
    speedKmh: first.speedKmh,
  });
}

export function undoRoutePath(state: RouteDraftState): RouteDraftState {
  const previousPath = state.pastPaths.at(-1);
  if (previousPath == null) {
    return state;
  }

  return {
    ...state,
    draft: { ...state.draft, waypoints: cloneWaypoints(previousPath) },
    futurePaths: [cloneWaypoints(state.draft.waypoints), ...state.futurePaths],
    pastPaths: state.pastPaths.slice(0, -1),
  };
}

export function redoRoutePath(state: RouteDraftState): RouteDraftState {
  const nextPath = state.futurePaths[0];
  if (nextPath == null) {
    return state;
  }

  return {
    ...state,
    draft: { ...state.draft, waypoints: cloneWaypoints(nextPath) },
    futurePaths: state.futurePaths.slice(1),
    pastPaths: [...state.pastPaths, cloneWaypoints(state.draft.waypoints)].slice(
      -MAX_HISTORY_ENTRIES,
    ),
  };
}

export function resetRouteDraft(state: RouteDraftState): RouteDraftState {
  return {
    ...state,
    draft: cloneDraft(state.baseline),
    futurePaths: [],
    pastPaths: [],
  };
}

export function getRouteValidation(draft: RouteDraft): RouteValidation {
  const name = draft.name.trim();
  if (name.length === 0) {
    return invalid('Enter a route name before saving.');
  }
  if (name.length > MAX_NAME_LENGTH) {
    return invalid(`Route name must be at most ${MAX_NAME_LENGTH} characters.`);
  }
  if (draft.description.trim().length > MAX_DESCRIPTION_LENGTH) {
    return invalid(`Description must be at most ${MAX_DESCRIPTION_LENGTH} characters.`);
  }

  const speedKmh = Number(draft.defaultSpeedKmh);
  if (!Number.isFinite(speedKmh) || speedKmh <= 0) {
    return invalid('Enter a route speed greater than zero.');
  }
  if (draft.waypoints.length < MIN_WAYPOINT_COUNT) {
    const remaining = MIN_WAYPOINT_COUNT - draft.waypoints.length;
    return invalid(`Add ${remaining} more waypoint${remaining === 1 ? '' : 's'} before saving.`);
  }
  if (draft.waypoints.length > MAX_WAYPOINT_COUNT) {
    return invalid(`Routes can contain at most ${MAX_WAYPOINT_COUNT} waypoints.`);
  }

  for (const [index, waypoint] of draft.waypoints.entries()) {
    if (!isCoordinateValid(waypoint.latitude, -90, 90)) {
      return invalid(`Waypoint ${index + 1} latitude must be between -90 and 90.`);
    }
    if (!isCoordinateValid(waypoint.longitude, -180, 180)) {
      return invalid(`Waypoint ${index + 1} longitude must be between -180 and 180.`);
    }
    if (
      waypoint.speedKmh != null &&
      (!Number.isFinite(waypoint.speedKmh) || waypoint.speedKmh <= 0)
    ) {
      return invalid(`Waypoint speed ${index + 1} must be greater than zero.`);
    }
    if (
      waypoint.pauseSeconds != null &&
      (!Number.isFinite(waypoint.pauseSeconds) || waypoint.pauseSeconds < 0)
    ) {
      return invalid(`Waypoint pause ${index + 1} must be zero or greater.`);
    }
  }

  return { isValid: true, saveDisabledReason: null };
}

export function isRouteDraftDirty(state: RouteDraftState): boolean {
  return !routeDraftsEqual(state.draft, state.baseline);
}

export function getRouteChangeSummary(state: RouteDraftState): string[] {
  const changes: string[] = [];
  const isNew = state.baseline.name.length === 0 && state.baseline.waypoints.length === 0;

  if (state.draft.name.trim() !== state.baseline.name.trim()) {
    changes.push(isNew ? 'Name set' : 'Name changed');
  }
  if (!routePathsEqual(state.draft.waypoints, state.baseline.waypoints)) {
    changes.push(isNew ? 'Path added' : 'Path changed');
  }
  if (
    Number(state.draft.defaultSpeedKmh) !== Number(state.baseline.defaultSpeedKmh) ||
    state.draft.mode !== state.baseline.mode
  ) {
    changes.push('Playback changed');
  }
  if (state.draft.description.trim() !== state.baseline.description.trim()) {
    changes.push('Details changed');
  }
  if (state.draft.isPublic !== state.baseline.isPublic) {
    changes.push('Visibility changed');
  }

  return changes;
}

export function toRouteInput(draft: RouteDraft): RouteInput {
  return {
    defaultSpeedKmh: Number(draft.defaultSpeedKmh),
    description: draft.description.trim() === '' ? null : draft.description.trim(),
    isPublic: draft.isPublic,
    mode: draft.mode,
    name: draft.name.trim(),
    waypoints: draft.waypoints.map((waypoint) => ({
      latitude: waypoint.latitude,
      longitude: waypoint.longitude,
      pauseSeconds: waypoint.pauseSeconds,
      speedKmh: waypoint.speedKmh,
    })),
  };
}

function recordPathChange(
  state: RouteDraftState,
  waypoints: RouteDraftWaypoint[],
  nextWaypointId: number,
): RouteDraftState {
  return {
    ...state,
    draft: { ...state.draft, waypoints: cloneWaypoints(waypoints) },
    futurePaths: [],
    nextWaypointId,
    pastPaths: [...state.pastPaths, cloneWaypoints(state.draft.waypoints)].slice(
      -MAX_HISTORY_ENTRIES,
    ),
  };
}

function routeDraftsEqual(left: RouteDraft, right: RouteDraft): boolean {
  return (
    Number(left.defaultSpeedKmh) === Number(right.defaultSpeedKmh) &&
    left.description.trim() === right.description.trim() &&
    left.isPublic === right.isPublic &&
    left.mode === right.mode &&
    left.name.trim() === right.name.trim() &&
    routePathsEqual(left.waypoints, right.waypoints)
  );
}

function routePathsEqual(left: RouteDraftWaypoint[], right: RouteDraftWaypoint[]): boolean {
  return (
    left.length === right.length &&
    left.every((waypoint, index) => {
      const other = right[index];
      return (
        other != null &&
        waypoint.draftId === other.draftId &&
        waypoint.latitude === other.latitude &&
        waypoint.longitude === other.longitude &&
        waypoint.pauseSeconds === other.pauseSeconds &&
        waypoint.speedKmh === other.speedKmh
      );
    })
  );
}

function cloneDraft(draft: RouteDraft): RouteDraft {
  return { ...draft, waypoints: cloneWaypoints(draft.waypoints) };
}

function cloneWaypoints(waypoints: RouteDraftWaypoint[]): RouteDraftWaypoint[] {
  return waypoints.map((waypoint) => ({ ...waypoint }));
}

function isCoordinateValid(value: number, minimum: number, maximum: number): boolean {
  return Number.isFinite(value) && value >= minimum && value <= maximum;
}

function invalid(saveDisabledReason: string): RouteValidation {
  return { isValid: false, saveDisabledReason };
}
