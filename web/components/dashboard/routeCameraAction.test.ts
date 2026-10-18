import assert from 'node:assert/strict';
import test from 'node:test';
import { getRouteCameraAction } from './routeCameraAction.ts';

const idle = {
  hasFitRequest: false,
  hasFocusRequest: false,
  isReady: true,
  shouldRefitAfterResize: false,
};

test('selection during loading stays pending and is applied when the map becomes ready', () => {
  const pending = { ...idle, hasFocusRequest: true, isReady: false };
  assert.equal(getRouteCameraAction(pending), null);
  assert.equal(getRouteCameraAction({ ...pending, isReady: true }), 'focus');
});

test('a fitted route resized during style loading is reframed after readiness', () => {
  const pending = { ...idle, shouldRefitAfterResize: true, isReady: false };
  assert.equal(getRouteCameraAction(pending), null);
  assert.equal(getRouteCameraAction({ ...pending, isReady: true }), 'fit');
});

test('a fit reveals the full route instead of allowing stale focus to override it', () => {
  assert.equal(
    getRouteCameraAction({ ...idle, hasFitRequest: true, hasFocusRequest: true }),
    'fit',
  );
  assert.equal(
    getRouteCameraAction({ ...idle, shouldRefitAfterResize: true, hasFocusRequest: true }),
    'fit',
  );
});

test('readiness alone does not move a camera that has no pending requests', () => {
  assert.equal(getRouteCameraAction(idle), null);
  assert.equal(getRouteCameraAction({ ...idle, isReady: false }), null);
});

test('explicit fit requests survive initial loading', () => {
  const pending = { ...idle, hasFitRequest: true, isReady: false };
  assert.equal(getRouteCameraAction(pending), null);
  assert.equal(getRouteCameraAction({ ...pending, isReady: true }), 'fit');
});
