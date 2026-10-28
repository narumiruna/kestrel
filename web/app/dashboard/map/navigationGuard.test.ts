import assert from 'node:assert/strict';
import test from 'node:test';
import { createDraftActionGuard } from './navigationGuard.ts';

test('clean navigation runs immediately; dirty navigation confirms only once', () => {
  const guard = createDraftActionGuard();
  const destinations: string[] = [];
  guard.request(false, () => destinations.push('clean'));
  guard.request(true, () => destinations.push('/dashboard/account'));
  guard.request(true, () => destinations.push('/dashboard/account#ai-assistant'));
  assert.deepEqual(destinations, ['clean']);
  guard.confirm();
  guard.confirm();
  assert.deepEqual(destinations, ['clean', '/dashboard/account']);
});

test('cancellation leaves the exact draft intact and permits a new request', () => {
  const guard = createDraftActionGuard();
  const draft = { name: 'Unsaved', waypoints: [{ latitude: 1, longitude: 2 }] };
  const waypoint = draft.waypoints[0];
  const snapshot = structuredClone(draft);
  const destinations: string[] = [];
  guard.request(true, () => {
    draft.name = 'discarded';
  });
  guard.cancel();
  guard.confirm();
  assert.deepEqual(draft, snapshot);
  assert.equal(draft.waypoints[0], waypoint);
  guard.request(true, () => destinations.push('/dashboard/account#ai-assistant'));
  guard.confirm();
  guard.confirm();
  assert.deepEqual(destinations, ['/dashboard/account#ai-assistant']);
});
