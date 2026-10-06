import assert from 'node:assert/strict';
import test from 'node:test';
import type { Route } from '../../lib/api.ts';
import {
  addRouteWaypoint,
  closeRouteLoop,
  createRouteDraftState,
  getRouteChangeSummary,
  getRouteValidation,
  getSelectedWaypointIndex,
  insertRouteWaypointAfter,
  isRouteDraftDirty,
  moveRouteWaypoint,
  rebaseRouteDraftAfterSave,
  redoRoutePath,
  refreshRouteDraftFromRoute,
  removeRouteWaypoint,
  resetRouteDraft,
  reverseRoute,
  setRouteDraftField,
  toRouteInput,
  undoRoutePath,
  updateRouteWaypoint,
  upsertRouteById,
} from './routeDraftState.ts';

test('selection follows identity through insertion, reorder, deletion, undo and redo', () => {
  let state = createRouteDraftState(null);
  for (let i = 0; i < 94; i++)
    state = addRouteWaypoint(state, { latitude: 25 + i / 1000, longitude: 121 });
  const selectedId = state.draft.waypoints[46].draftId;
  assert.equal(getSelectedWaypointIndex(state.draft.waypoints, selectedId), 46);
  state = insertRouteWaypointAfter(state, 0);
  assert.equal(getSelectedWaypointIndex(state.draft.waypoints, selectedId), 47);
  state = moveRouteWaypoint(state, 47, 2);
  assert.equal(getSelectedWaypointIndex(state.draft.waypoints, selectedId), 2);
  state = removeRouteWaypoint(state, state.draft.waypoints[0].draftId);
  assert.equal(getSelectedWaypointIndex(state.draft.waypoints, selectedId), 1);
  state = removeRouteWaypoint(state, selectedId);
  assert.equal(getSelectedWaypointIndex(state.draft.waypoints, selectedId), null);
  state = undoRoutePath(state);
  assert.equal(getSelectedWaypointIndex(state.draft.waypoints, selectedId), 1);
  state = redoRoutePath(state);
  assert.equal(getSelectedWaypointIndex(state.draft.waypoints, selectedId), null);
});

const route: Route = {
  createdAt: '2026-08-10T00:00:00.000Z',
  currentRevision: {
    createdAt: '2026-08-10T00:00:00.000Z',
    createdBy: 'user-1',
    defaultSpeedKmh: 12,
    id: 'revision-1',
    mode: 'LOOP',
    revisionNumber: 3,
    waypoints: [
      {
        latitude: 25.03,
        longitude: 121.56,
        pauseSeconds: 4,
        sequence: 0,
        speedKmh: 8,
      },
      {
        latitude: 25.04,
        longitude: 121.57,
        pauseSeconds: null,
        sequence: 1,
        speedKmh: null,
      },
    ],
  },
  defaultSpeedKmh: 12,
  deletedAt: null,
  description: 'Commute',
  id: 'route-1',
  isPublic: false,
  libraryItem: null,
  mode: 'LOOP',
  name: 'Morning route',
  updatedAt: '2026-08-10T00:00:00.000Z',
};

function createSavedRoute(name: string): Route & {
  currentRevision: NonNullable<Route['currentRevision']>;
} {
  if (route.currentRevision == null) {
    throw new Error('route fixture must include a revision');
  }

  return {
    ...route,
    currentRevision: {
      ...route.currentRevision,
      id: 'revision-4',
      revisionNumber: 4,
    },
    name,
  };
}

test('creates stable draft waypoints and strips client ids from save input', () => {
  const state = createRouteDraftState(route);

  assert.deepEqual(
    state.draft.waypoints.map((waypoint) => waypoint.draftId),
    ['revision-1:0', 'revision-1:1'],
  );
  assert.deepEqual(toRouteInput(state.draft).waypoints, [
    { latitude: 25.03, longitude: 121.56, pauseSeconds: 4, speedKmh: 8 },
    { latitude: 25.04, longitude: 121.57, pauseSeconds: null, speedKmh: null },
  ]);
});

test('preserves metadata through coordinate edits, moves, and reverse', () => {
  let state = createRouteDraftState(route);
  const firstId = state.draft.waypoints[0].draftId;

  state = updateRouteWaypoint(state, firstId, { latitude: 25.031, longitude: 121.561 });
  state = moveRouteWaypoint(state, 0, 1);
  state = reverseRoute(state);

  assert.equal(state.draft.waypoints[0].draftId, firstId);
  assert.equal(state.draft.waypoints[0].speedKmh, 8);
  assert.equal(state.draft.waypoints[0].pauseSeconds, 4);
  assert.equal(state.draft.waypoints[0].latitude, 25.031);
});

test('supports bounded path undo and redo without changing route fields', () => {
  let state = createRouteDraftState(route);
  state = setRouteDraftField(state, 'name', 'Renamed route');
  state = addRouteWaypoint(state, { latitude: 25.05, longitude: 121.58 });
  state = removeRouteWaypoint(state, state.draft.waypoints[0].draftId);

  assert.equal(state.draft.waypoints.length, 2);
  assert.equal(state.draft.name, 'Renamed route');

  state = undoRoutePath(state);
  assert.equal(state.draft.waypoints.length, 3);
  state = undoRoutePath(state);
  assert.equal(state.draft.waypoints.length, 2);
  assert.equal(state.draft.name, 'Renamed route');

  state = redoRoutePath(state);
  assert.equal(state.draft.waypoints.length, 3);
  assert.equal(state.draft.name, 'Renamed route');
});

test('duplicates a waypoint after the selected row with metadata and a new identity', () => {
  let state = createRouteDraftState(route);
  state = insertRouteWaypointAfter(state, 0);

  assert.equal(state.draft.waypoints.length, 3);
  assert.notEqual(state.draft.waypoints[0].draftId, state.draft.waypoints[1].draftId);
  assert.equal(state.draft.waypoints[1].speedKmh, 8);
  assert.equal(state.draft.waypoints[1].pauseSeconds, 4);
});

test('closes a loop once and copies known metadata with a new identity', () => {
  let state = createRouteDraftState(route);
  state = closeRouteLoop(state);

  assert.equal(state.draft.waypoints.length, 3);
  const first = state.draft.waypoints[0];
  const last = state.draft.waypoints[2];
  assert.notEqual(last.draftId, first.draftId);
  assert.deepEqual(
    {
      latitude: last.latitude,
      longitude: last.longitude,
      pauseSeconds: last.pauseSeconds,
      speedKmh: last.speedKmh,
    },
    {
      latitude: first.latitude,
      longitude: first.longitude,
      pauseSeconds: first.pauseSeconds,
      speedKmh: first.speedKmh,
    },
  );

  state = closeRouteLoop(state);
  assert.equal(state.draft.waypoints.length, 3);
});

test('does not recommend closing ping-pong routes', () => {
  let state = createRouteDraftState(route);
  state = setRouteDraftField(state, 'mode', 'PING_PONG');

  assert.equal(closeRouteLoop(state), state);
});

test('validates route limits and reports concrete dirty changes', () => {
  let state = createRouteDraftState(null);
  let validation = getRouteValidation(state.draft);
  assert.equal(validation.isValid, false);
  assert.match(validation.saveDisabledReason ?? '', /name/i);

  state = setRouteDraftField(state, 'name', 'Exact route');
  state = addRouteWaypoint(state, { latitude: 25.03, longitude: 121.56 });
  state = addRouteWaypoint(state, { latitude: 25.04, longitude: 121.57 });
  state = setRouteDraftField(state, 'defaultSpeedKmh', '0');
  validation = getRouteValidation(state.draft);
  assert.match(validation.saveDisabledReason ?? '', /speed/i);

  state = setRouteDraftField(state, 'defaultSpeedKmh', '7.5');
  validation = getRouteValidation(state.draft);
  assert.equal(validation.isValid, true);
  assert.deepEqual(getRouteChangeSummary(state), ['Name set', 'Path added', 'Playback changed']);
});

test('accepts 1000 waypoints and rejects 1001', () => {
  let state = createRouteDraftState(null);
  state = setRouteDraftField(state, 'name', 'Long route');
  const waypoints = Array.from({ length: 1000 }, (_, index) => ({
    draftId: `long:${index}`,
    latitude: 25 + index / 100_000,
    longitude: 121.5,
    pauseSeconds: null,
    speedKmh: null,
  }));
  const validDraft = { ...state.draft, waypoints };
  assert.equal(getRouteValidation(validDraft).isValid, true);

  const invalidDraft = {
    ...validDraft,
    waypoints: [...waypoints, { ...waypoints[0], draftId: 'long:1000' }],
  };
  assert.match(getRouteValidation(invalidDraft).saveDisabledReason ?? '', /at most 1000/i);
});

test('reset restores the baseline and clears path history', () => {
  let state = createRouteDraftState(route);
  state = setRouteDraftField(state, 'name', 'Changed');
  state = addRouteWaypoint(state, { latitude: 25.05, longitude: 121.58 });

  state = resetRouteDraft(state);

  assert.equal(state.draft.name, route.name);
  assert.equal(state.draft.waypoints.length, 2);
  assert.deepEqual(state.pastPaths, []);
  assert.deepEqual(state.futurePaths, []);
});

test('rebases a saved route without losing edits made after submission', () => {
  let submittedState = createRouteDraftState(route);
  submittedState = setRouteDraftField(submittedState, 'name', 'Submitted route');

  let currentState = setRouteDraftField(submittedState, 'name', 'Late route edit');
  currentState = setRouteDraftField(currentState, 'defaultSpeedKmh', '21');
  currentState = setRouteDraftField(currentState, 'description', 'Late details');
  currentState = setRouteDraftField(currentState, 'isPublic', true);
  currentState = setRouteDraftField(currentState, 'mode', 'PING_PONG');
  currentState = addRouteWaypoint(currentState, { latitude: 25.05, longitude: 121.58 });

  const savedRoute = createSavedRoute('Submitted route');
  const rebasedState = rebaseRouteDraftAfterSave(currentState, submittedState, savedRoute);

  assert.equal(rebasedState.baseline.name, 'Submitted route');
  assert.equal(rebasedState.draft.name, 'Late route edit');
  assert.equal(rebasedState.draft.defaultSpeedKmh, '21');
  assert.equal(rebasedState.draft.description, 'Late details');
  assert.equal(rebasedState.draft.isPublic, true);
  assert.equal(rebasedState.draft.mode, 'PING_PONG');
  assert.equal(rebasedState.draft.waypoints.length, 3);
  assert.equal(rebasedState.pastPaths.length, 1);
  assert.deepEqual(rebasedState.pastPaths[0], rebasedState.baseline.waypoints);
  assert.deepEqual(toRouteInput(rebasedState.draft).waypoints.at(-1), {
    latitude: 25.05,
    longitude: 121.58,
    pauseSeconds: null,
    speedKmh: null,
  });
});

test('accepts the saved response as a clean baseline when no later edits exist', () => {
  let submittedState = createRouteDraftState(route);
  submittedState = setRouteDraftField(submittedState, 'name', 'Submitted route');
  const savedRoute = createSavedRoute('Submitted route');

  const rebasedState = rebaseRouteDraftAfterSave(submittedState, submittedState, savedRoute);

  assert.equal(rebasedState.draft.name, 'Submitted route');
  assert.equal(rebasedState.draft.waypoints[0].draftId, submittedState.draft.waypoints[0].draftId);
  assert.equal(isRouteDraftDirty(rebasedState), false);
  assert.deepEqual(rebasedState.pastPaths, []);
  assert.deepEqual(rebasedState.futurePaths, []);
});

test('selection survives saving a locally added waypoint and the following refresh', () => {
  const submittedState = addRouteWaypoint(createRouteDraftState(route), {
    latitude: 25.05,
    longitude: 121.58,
  });
  const selectedId = submittedState.draft.waypoints[2].draftId;
  const savedRoute = createSavedRoute(route.name);
  savedRoute.currentRevision.waypoints = toRouteInput(submittedState.draft).waypoints.map(
    (waypoint, sequence) => ({ ...waypoint, sequence }),
  );

  const rebased = rebaseRouteDraftAfterSave(submittedState, submittedState, savedRoute);
  const refreshed = refreshRouteDraftFromRoute(rebased, savedRoute);
  assert.equal(getSelectedWaypointIndex(rebased.draft.waypoints, selectedId), 2);
  assert.equal(getSelectedWaypointIndex(refreshed.draft.waypoints, selectedId), 2);
  assert.equal(isRouteDraftDirty(refreshed), false);
  assert.deepEqual(refreshed.draft.waypoints, refreshed.baseline.waypoints);
  assert.equal(submittedState.draft.waypoints[2].draftId, selectedId);
});

test('save preserves later reorder selection and the identities restored by undo', () => {
  const submittedState = setRouteDraftField(createRouteDraftState(route), 'name', 'Submitted');
  const selectedId = submittedState.draft.waypoints[0].draftId;
  const currentState = moveRouteWaypoint(submittedState, 0, 1);
  const savedRoute = createSavedRoute('Submitted');
  const rebased = rebaseRouteDraftAfterSave(currentState, submittedState, savedRoute);

  assert.equal(getSelectedWaypointIndex(rebased.draft.waypoints, selectedId), 1);
  assert.equal(refreshRouteDraftFromRoute(rebased, savedRoute), rebased);
  const undone = undoRoutePath(rebased);
  assert.equal(getSelectedWaypointIndex(undone.draft.waypoints, selectedId), 0);
  assert.equal(isRouteDraftDirty(undone), false);
  const redone = redoRoutePath(undone);
  assert.equal(getSelectedWaypointIndex(redone.draft.waypoints, selectedId), 1);
});

test('clean refresh retains identities for unchanged paths but not unrelated changed paths', () => {
  const state = createRouteDraftState(route);
  const selectedId = state.draft.waypoints[1].draftId;
  const savedRoute = createSavedRoute('Externally renamed');
  const refreshed = refreshRouteDraftFromRoute(state, savedRoute);
  assert.equal(refreshed.draft.name, 'Externally renamed');
  assert.equal(getSelectedWaypointIndex(refreshed.draft.waypoints, selectedId), 1);
  assert.equal(isRouteDraftDirty(refreshed), false);

  savedRoute.currentRevision.waypoints = [...savedRoute.currentRevision.waypoints].reverse();
  const changed = refreshRouteDraftFromRoute(refreshed, savedRoute);
  assert.equal(getSelectedWaypointIndex(changed.draft.waypoints, selectedId), null);
  assert.equal(changed.draft.waypoints[0].latitude, state.draft.waypoints[1].latitude);
});

test('new-route save and refresh preserve selected IDs and collision-free allocation', () => {
  let submittedState = createRouteDraftState(null);
  submittedState = setRouteDraftField(submittedState, 'name', 'New route');
  submittedState = addRouteWaypoint(submittedState, { latitude: 25, longitude: 121 });
  submittedState = addRouteWaypoint(submittedState, { latitude: 26, longitude: 122 });
  submittedState = { ...submittedState, nextWaypointId: 9 };
  const input = toRouteInput(submittedState.draft);
  const savedRoute = { ...createSavedRoute(input.name), ...input };
  savedRoute.currentRevision.waypoints = input.waypoints.map((waypoint, sequence) => ({
    ...waypoint,
    sequence,
  }));
  const selectedId = submittedState.draft.waypoints[1].draftId;
  const rebased = rebaseRouteDraftAfterSave(submittedState, submittedState, savedRoute);
  const refreshed = refreshRouteDraftFromRoute(rebased, savedRoute);
  const extended = addRouteWaypoint(refreshed, { latitude: 27, longitude: 123 });
  assert.equal(getSelectedWaypointIndex(refreshed.draft.waypoints, selectedId), 1);
  assert.equal(isRouteDraftDirty(refreshed), false);
  assert.equal(extended.draft.waypoints[2].draftId, 'draft-9');
  assert.equal(new Set(extended.draft.waypoints.map((point) => point.draftId)).size, 3);
});

test('upserts a successful route response before a list refresh', () => {
  const createdRoute = { ...route, id: 'route-2', name: 'Created route' };
  assert.deepEqual(upsertRouteById([route], createdRoute), [route, createdRoute]);

  const updatedRoute = { ...route, name: 'Updated route' };
  assert.deepEqual(upsertRouteById([route], updatedRoute), [updatedRoute]);
});

test('rejects invalid known waypoint metadata before serialization', () => {
  const state = createRouteDraftState(route);
  const invalidSpeed = {
    ...state.draft,
    waypoints: state.draft.waypoints.map((waypoint, index) =>
      index === 0 ? { ...waypoint, speedKmh: -1 } : waypoint,
    ),
  };
  const invalidPause = {
    ...state.draft,
    waypoints: state.draft.waypoints.map((waypoint, index) =>
      index === 0 ? { ...waypoint, pauseSeconds: -1 } : waypoint,
    ),
  };

  assert.match(getRouteValidation(invalidSpeed).saveDisabledReason ?? '', /waypoint speed/i);
  assert.match(getRouteValidation(invalidPause).saveDisabledReason ?? '', /pause/i);
});
