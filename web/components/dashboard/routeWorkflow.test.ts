import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addRouteWaypoint,
  createRouteDraftState,
  redoRoutePath,
  undoRoutePath,
} from './routeDraftState.ts';
import {
  type RouteWorkflowMode,
  type RouteWorkflowState,
  routeWorkflowReducer,
} from './routeWorkflow.ts';

test('View and Playback cannot append points; only Edit can enter map-add mode', () => {
  for (const mode of ['view', 'edit', 'playback'] as RouteWorkflowMode[]) {
    const state: RouteWorkflowState = { mode, isAdding: false };
    assert.equal(routeWorkflowReducer(state, { type: 'start-add' }).isAdding, mode === 'edit');
  }
});

test('every mode change cancels map adding without discarding the draft or Undo/Redo history', () => {
  let draft = addRouteWaypoint(createRouteDraftState(null), { latitude: 25, longitude: 121 });
  const before = structuredClone(draft);
  for (const mode of ['view', 'edit', 'playback'] as RouteWorkflowMode[]) {
    assert.deepEqual(
      routeWorkflowReducer({ mode: 'edit', isAdding: true }, { type: 'mode', mode }),
      { mode, isAdding: false },
    );
    assert.deepEqual(draft, before);
  }
  draft = undoRoutePath(draft);
  assert.equal(draft.draft.waypoints.length, 0);
  draft = redoRoutePath(draft);
  assert.equal(draft.draft.waypoints.length, 1);
});

test('Escape/cancel ends adding but keeps Edit active and does not undo points already added', () => {
  const editing: RouteWorkflowState = { mode: 'edit', isAdding: false };
  const adding = routeWorkflowReducer(editing, { type: 'start-add' });
  assert.deepEqual(routeWorkflowReducer(adding, { type: 'cancel-add' }), editing);
  assert.equal(routeWorkflowReducer(editing, { type: 'cancel-add' }), editing);
});
