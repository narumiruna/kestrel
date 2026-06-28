import { RouteMode } from '@prisma/client';
import { mapRoute } from './library.models';

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
