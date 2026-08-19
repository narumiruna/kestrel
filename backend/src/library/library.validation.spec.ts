import { BadRequestException } from '../http/errors';
import {
  parseCreateRouteInput,
  parseUpdateRouteInput,
} from './library.validation';

describe('route waypoint validation', () => {
  const baseRoute = {
    defaultSpeedKmh: 12,
    description: null,
    isPublic: false,
    mode: 'LOOP',
    name: 'Metadata route',
  };

  it('keeps coordinate-only clients compatible', () => {
    expect(
      parseCreateRouteInput({
        ...baseRoute,
        waypoints: [
          { latitude: 25.03, longitude: 121.56 },
          { latitude: 25.04, longitude: 121.57 },
        ],
      }).waypoints,
    ).toEqual([
      {
        latitude: 25.03,
        longitude: 121.56,
        pauseSeconds: null,
        speedKmh: null,
      },
      {
        latitude: 25.04,
        longitude: 121.57,
        pauseSeconds: null,
        speedKmh: null,
      },
    ]);
  });

  it('accepts finite positive speed and non-negative pause metadata', () => {
    expect(
      parseUpdateRouteInput({
        waypoints: [
          {
            latitude: 25.03,
            longitude: 121.56,
            pauseSeconds: 0,
            speedKmh: 8.5,
          },
          {
            latitude: 25.04,
            longitude: 121.57,
            pauseSeconds: null,
            speedKmh: null,
          },
        ],
      }).waypoints,
    ).toEqual([
      { latitude: 25.03, longitude: 121.56, pauseSeconds: 0, speedKmh: 8.5 },
      {
        latitude: 25.04,
        longitude: 121.57,
        pauseSeconds: null,
        speedKmh: null,
      },
    ]);
  });

  it.each([
    ['speedKmh', 0],
    ['speedKmh', Number.POSITIVE_INFINITY],
    ['pauseSeconds', -1],
    ['pauseSeconds', Number.NaN],
  ])('rejects invalid %s metadata', (field, value) => {
    expect(() =>
      parseUpdateRouteInput({
        waypoints: [
          { latitude: 25.03, longitude: 121.56, [field]: value },
          { latitude: 25.04, longitude: 121.57 },
        ],
      }),
    ).toThrow(BadRequestException);
  });
});
