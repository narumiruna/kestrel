import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canEditRouteOnMap,
  getRouteMapInstruction,
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

test('uses precise fallback instructions for map and route-preview failures', () => {
  assert.match(getRouteMapInstruction('ready'), /Click the map/);
  assert.doesNotMatch(getRouteMapInstruction('loading'), /Click the map/);
  assert.match(getRouteMapInstruction('unavailable'), /^Map unavailable/);
  assert.match(getRouteMapInstruction('route-preview-error'), /^Route preview unavailable/);
  assert.doesNotMatch(getRouteMapInstruction('unavailable'), /numbered marker/);
});
