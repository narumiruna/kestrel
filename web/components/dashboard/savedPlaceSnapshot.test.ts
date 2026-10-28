import assert from 'node:assert/strict';
import test from 'node:test';
import { getSavedPlaceSnapshot } from './savedPlaceSnapshot.ts';

test('a new place has no saved source for Device or Share', () => {
  assert.equal(getSavedPlaceSnapshot(null), null);
});

test('saved preview and command point come from the same saved place', () => {
  const saved = { name: 'Park entrance', latitude: 25.0269, longitude: 121.5375 };
  assert.deepEqual(getSavedPlaceSnapshot(saved), {
    name: 'Park entrance',
    coordinates: '25.026900, 121.537500',
    point: { latitude: 25.0269, longitude: 121.5375 },
  });
});

test('draft edits cannot replace the saved source', () => {
  const saved = Object.freeze({
    name: 'Saved place',
    latitude: 25.0269,
    longitude: 121.5375,
  });
  const draft: { name: string; latitude: number; longitude: number } = {
    ...saved,
    name: 'Edited draft',
    latitude: 25.0345,
  };
  const snapshot = getSavedPlaceSnapshot(saved);
  assert.equal(snapshot?.name, saved.name);
  assert.equal(snapshot?.point.latitude, saved.latitude);
  assert.notEqual(snapshot?.point.latitude, draft.latitude);
  draft.longitude = 120;
  assert.equal(snapshot?.point.longitude, saved.longitude);
});

test('display rounding never rounds the numeric device point', () => {
  const snapshot = getSavedPlaceSnapshot({
    name: 'Exact point',
    latitude: 12.123456789,
    longitude: -87.987654321,
  });
  assert.equal(snapshot?.coordinates, '12.123457, -87.987654');
  assert.deepEqual(snapshot?.point, { latitude: 12.123456789, longitude: -87.987654321 });
});

test('duplicate names keep their own saved coordinates', () => {
  const first = getSavedPlaceSnapshot({ name: 'Entrance', latitude: 1, longitude: 2 });
  const second = getSavedPlaceSnapshot({ name: 'Entrance', latitude: 3, longitude: 4 });
  assert.equal(first?.name, second?.name);
  assert.notEqual(first?.coordinates, second?.coordinates);
  assert.notDeepEqual(first?.point, second?.point);
});
