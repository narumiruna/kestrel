import assert from 'node:assert/strict';
import test from 'node:test';
import { ApiError } from '../../lib/api.ts';
import {
  arePlaceCoordinatesValid,
  getPlacePreviewCoordinates,
  parsePlaceCoordinate,
} from './placeCoordinates.ts';

test('preview accepts only finite, in-range coordinate pairs', () => {
  for (const latitude of ['100', '-91', '-', '', ' ', 'NaN', 'Infinity', 'latitude100']) {
    assert.equal(getPlacePreviewCoordinates(latitude, '121'), null, latitude);
  }
  for (const longitude of ['181', '-181', '-', '', ' ', 'NaN', 'Infinity', '121east']) {
    assert.equal(getPlacePreviewCoordinates('25', longitude), null, longitude);
  }
  assert.deepEqual(getPlacePreviewCoordinates(' -90 ', '180'), { latitude: -90, longitude: 180 });
  assert.deepEqual(getPlacePreviewCoordinates('90', '-180'), { latitude: 90, longitude: -180 });
  assert.deepEqual(getPlacePreviewCoordinates('-0', '0.000000'), { latitude: -0, longitude: 0 });
});

test('map boundary rejects invalid numeric props independently of editor parsing', () => {
  const invalid = [
    null,
    undefined,
    { latitude: 100, longitude: 121 },
    { latitude: -90.000001, longitude: 0 },
    { latitude: 0, longitude: 180.000001 },
    { latitude: 0, longitude: -181 },
    { latitude: Number.NaN, longitude: 0 },
    { latitude: 0, longitude: Number.POSITIVE_INFINITY },
    { latitude: Number.NEGATIVE_INFINITY, longitude: 0 },
  ];
  for (const coords of invalid) assert.equal(arePlaceCoordinatesValid(coords), false);
  for (const latitude of [-90, 0, 90]) {
    for (const longitude of [-180, 0, 180]) {
      assert.equal(arePlaceCoordinatesValid({ latitude, longitude }), true);
    }
  }
});

test('submit validation uses existing localized error codes and never converts blank text to zero', () => {
  for (const axis of ['latitude', 'longitude'] as const) {
    for (const text of ['-', '', ' ', 'Infinity', axis === 'latitude' ? '100' : '181']) {
      assert.throws(
        () => parsePlaceCoordinate(text, axis),
        (error) => {
          assert.ok(error instanceof ApiError);
          assert.equal(error.code, axis === 'latitude' ? 'INVALID_LATITUDE' : 'INVALID_LONGITUDE');
          return true;
        },
      );
    }
  }
  assert.equal(parsePlaceCoordinate('25.012345', 'latitude'), 25.012345);
  assert.equal(parsePlaceCoordinate('-180', 'longitude'), -180);
});
