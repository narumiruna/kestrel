import assert from 'node:assert/strict';
import test from 'node:test';
import type { Place } from '../../lib/api.ts';
import {
  formatWaypointCoords,
  formatWaypointName,
  getWaypointBadgeClassName,
} from './routeEditorUtils.ts';

test('coordinate editing and copying keep decimal points regardless of display locale', () => {
  assert.equal(
    formatWaypointCoords({ latitude: 25.03312, longitude: -121.56541 }),
    '25.03312, -121.56541',
  );
});

test('waypoint names preserve user content and accept an explicit localized fallback', () => {
  const point = { latitude: 25.033, longitude: 121.5654 };
  const place = { ...point, name: 'User content' } as Place;
  assert.equal(formatWaypointName(point, [place], 'Punkt 1'), 'User content');
  assert.equal(formatWaypointName(point, [], 'Punkt 1'), 'Punkt 1');
  assert.equal(getWaypointBadgeClassName(0, 3), 'waypoint-badge is-terminal');
  assert.equal(getWaypointBadgeClassName(1, 3), 'waypoint-badge is-middle');
  assert.equal(getWaypointBadgeClassName(2, 3), 'waypoint-badge is-terminal');
});
