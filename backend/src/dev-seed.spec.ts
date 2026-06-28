import { RouteMode } from '@prisma/client';
import { buildSeedRoutePayload } from './dev-seed';

describe('buildSeedRoutePayload', () => {
  it('assigns stable waypoint sequences', () => {
    const payload = buildSeedRoutePayload({
      defaultSpeedKmh: 5,
      description: 'test route',
      mode: RouteMode.ONCE,
      name: 'Test route',
      waypoints: [
        { latitude: 25.0, longitude: 121.0 },
        { latitude: 25.1, longitude: 121.1 },
        { latitude: 25.2, longitude: 121.2 },
      ],
    });

    expect(payload.waypoints.map((waypoint) => waypoint.sequence)).toEqual([
      0, 1, 2,
    ]);
  });
});
