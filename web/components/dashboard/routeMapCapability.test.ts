import assert from 'node:assert/strict';
import test from 'node:test';
import { createTranslator } from 'next-intl';
import messages from '../../messages/en.json' with { type: 'json' };
import {
  canEditRouteOnMap,
  getRouteViewportControlState,
  getRouteMapInstruction as instruction,
  type RouteMapCapability,
} from '../routeMapCapability.ts';

const unavailableCapabilities: RouteMapCapability[] = [
  'loading',
  'route-preview-error',
  'unavailable',
];

const t = createTranslator({ locale: 'en', messages, namespace: 'routeMapInstructions' });
function getRouteMapInstruction(capability: RouteMapCapability) {
  return instruction(capability, t);
}

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

test('instructions resolve fresh text from explicit translators for every capability', () => {
  for (const capability of ['ready', ...unavailableCapabilities] as const) {
    const expected = capability === 'route-preview-error' ? 'previewError' : capability;
    assert.equal(
      instruction(capability, (key) => `translated:${key}`),
      `translated:${expected}`,
    );
  }
});
