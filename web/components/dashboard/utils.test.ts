import assert from 'node:assert/strict';
import test from 'node:test';
import { ApiError } from '../../lib/api.ts';
import { formatCoord, formatRouteDistanceFromWaypoints, parseNumber } from './utils.ts';

test('coordinate editing and copying keep decimal points regardless of display locale', () => {
  assert.equal(formatCoord(25.0331234), '25.033123');
  assert.equal(parseNumber('25.033123', 'latitude'), 25.033123);
  assert.throws(
    () => parseNumber('25,033123', 'latitude'),
    (error) => error instanceof ApiError && error.code === 'INVALID_LATITUDE',
  );
  assert.throws(
    () => parseNumber('Infinity', 'longitude'),
    (error) => error instanceof ApiError && error.code === 'INVALID_LONGITUDE',
  );
});
test('distance uses unchanged geometry with locale-specific presentation', () => {
  const waypoints = [
    { latitude: 0, longitude: 0 },
    { latitude: 0, longitude: 0.01 },
  ];
  assert.match(formatRouteDistanceFromWaypoints(waypoints, 'en'), /1.1/);
  assert.match(formatRouteDistanceFromWaypoints(waypoints, 'de'), /1,1/);
  assert.equal(
    JSON.stringify(waypoints),
    '[{"latitude":0,"longitude":0},{"latitude":0,"longitude":0.01}]',
  );
});
