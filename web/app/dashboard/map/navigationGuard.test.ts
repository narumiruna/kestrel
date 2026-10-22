import assert from 'node:assert/strict';
import test from 'node:test';
import { createDraftActionGuard, isCurrentTabNavigation } from './navigationGuard.ts';

const click = {
  button: 0,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  defaultPrevented: false,
  currentTarget: { target: '', hasAttribute: () => false },
};

test('only normal current-tab navigation uses the guard', () => {
  assert.equal(isCurrentTabNavigation(click), true);
  for (const key of ['metaKey', 'ctrlKey', 'shiftKey', 'altKey', 'defaultPrevented']) {
    assert.equal(isCurrentTabNavigation({ ...click, [key]: true }), false);
  }
  for (const button of [1, 2]) {
    assert.equal(isCurrentTabNavigation({ ...click, button }), false);
  }
  assert.equal(
    isCurrentTabNavigation({
      ...click,
      currentTarget: { target: '_blank', hasAttribute: () => false },
    }),
    false,
  );
  assert.equal(
    isCurrentTabNavigation({
      ...click,
      currentTarget: { target: '', hasAttribute: () => true },
    }),
    false,
  );
});

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
