import { RouteMode } from '@prisma/client';
import { InternalServerErrorException } from '../http/errors';
import { mapRoute, mapRouteRevision } from './library.models';

describe('mapRouteRevision stored payload contract', () => {
  const waypoint = { latitude: 25, longitude: 121, sequence: 0 };
  const payload = {
    defaultSpeedKmh: 0,
    mode: RouteMode.ONCE,
    waypoints: [waypoint],
  };
  const revision = {
    createdAt: new Date('2026-06-27T00:00:00.000Z'),
    createdBy: 'user-1',
    id: 'revision-1',
    revisionNumber: 1,
  };

  it('retains missing versus null metadata without applying request limits', () => {
    const result = mapRouteRevision({
      ...revision,
      payload: {
        ...payload,
        waypoints: [
          { ...waypoint, sequence: 9, pauseSeconds: null, speedKmh: null },
          { ...waypoint, latitude: 100, sequence: -1 },
        ],
      },
    });

    expect(result.defaultSpeedKmh).toBe(0);
    expect(result.waypoints).toStrictEqual([
      {
        ...waypoint,
        latitude: 100,
        sequence: -1,
        pauseSeconds: undefined,
        speedKmh: undefined,
      },
      { ...waypoint, sequence: 9, pauseSeconds: null, speedKmh: null },
    ]);
  });

  it.each([
    [null, 'stored route revision payload is invalid'],
    [[], 'stored route revision payload is invalid'],
    [{ ...payload, mode: 'once' }, 'stored route revision payload is invalid'],
    [
      { ...payload, defaultSpeedKmh: Infinity },
      'stored route revision payload is invalid',
    ],
    [
      { ...payload, waypoints: null },
      'stored route revision payload is invalid',
    ],
    [{ ...payload, waypoints: [null] }, 'stored route waypoint 0 is invalid'],
    [
      { ...payload, waypoints: [{ ...waypoint, sequence: 0.5 }] },
      'stored route waypoint 0 is invalid',
    ],
    [
      { ...payload, waypoints: [{ ...waypoint, latitude: NaN }] },
      'stored route waypoint 0 is invalid',
    ],
    [
      { ...payload, waypoints: [{ ...waypoint, pauseSeconds: '1' }] },
      'stored route waypoint 0 is invalid',
    ],
    [
      { ...payload, waypoints: [{ ...waypoint, speedKmh: Infinity }] },
      'stored route waypoint 0 is invalid',
    ],
  ])(
    'rejects malformed stored data without changing its error (%j)',
    (value, message) => {
      const parse = () => mapRouteRevision({ ...revision, payload: value });
      expect(parse).toThrow(InternalServerErrorException);
      expect(parse).toThrow(message);
    },
  );
});

describe('mapRoute', () => {
  it('orders stored waypoints by sequence', () => {
    const route = mapRoute({
      createdAt: new Date('2026-06-27T00:00:00.000Z'),
      currentRevision: {
        createdAt: new Date('2026-06-27T00:00:00.000Z'),
        createdBy: 'user-1',
        id: 'revision-1',
        payload: {
          defaultSpeedKmh: 15,
          mode: RouteMode.ONCE,
          waypoints: [
            {
              latitude: 25.2,
              longitude: 121.2,
              pauseSeconds: null,
              sequence: 2,
              speedKmh: null,
            },
            {
              latitude: 25.0,
              longitude: 121.0,
              pauseSeconds: null,
              sequence: 0,
              speedKmh: null,
            },
            {
              latitude: 25.1,
              longitude: 121.1,
              pauseSeconds: null,
              sequence: 1,
              speedKmh: null,
            },
          ],
        },
        revisionNumber: 1,
      },
      defaultSpeedKmh: 15,
      deletedAt: null,
      description: null,
      id: 'route-1',
      isPublic: false,
      libraryItem: null,
      mode: RouteMode.ONCE,
      name: 'Route',
      updatedAt: new Date('2026-06-27T00:00:00.000Z'),
    });

    expect(
      route.currentRevision?.waypoints.map((waypoint) => waypoint.sequence),
    ).toEqual([0, 1, 2]);
  });
});
