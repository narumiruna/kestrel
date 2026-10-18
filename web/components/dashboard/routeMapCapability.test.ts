import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canEditRouteOnMap,
  getRouteMapInstruction,
  getRouteViewportControlState,
  type RouteMapCapability,
} from '../routeMapCapability.ts';

const unavailableCapabilities: RouteMapCapability[] = [
  'loading',
  'route-preview-error',
  'unavailable',
];

test('only enables map route editing when the preview is ready', () => {
  assert.equal(canEditRouteOnMap('ready'), true);
  for (const capability of unavailableCapabilities) {
    assert.equal(canEditRouteOnMap(capability), false);
  }
});

test('a ready empty route disables fitting but keeps zoom controls available', () => {
  assert.deepEqual(getRouteViewportControlState('ready', 0), {
    fitDisabled: true,
    viewportDisabled: false,
  });
});

test('ready single-point and multi-point routes keep fit and zoom available', () => {
  for (const waypointCount of [1, 2, 1000]) {
    assert.deepEqual(getRouteViewportControlState('ready', waypointCount), {
      fitDisabled: false,
      viewportDisabled: false,
    });
  }
});

test('loading and failed maps keep all viewport actions disabled regardless of point count', () => {
  for (const capability of unavailableCapabilities) {
    for (const waypointCount of [0, 1, 2]) {
      assert.deepEqual(getRouteViewportControlState(capability, waypointCount), {
        fitDisabled: true,
        viewportDisabled: true,
      });
    }
  }
});

test('uses precise fallback instructions for map and route-preview failures', () => {
  assert.match(getRouteMapInstruction('ready'), /Click the map/);
  assert.doesNotMatch(getRouteMapInstruction('loading'), /Click the map/);
  assert.match(getRouteMapInstruction('unavailable'), /^Map unavailable/);
  assert.match(getRouteMapInstruction('route-preview-error'), /^Route preview unavailable/);
  assert.doesNotMatch(getRouteMapInstruction('unavailable'), /numbered marker/);
});
