import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { RouteMode } from '@prisma/client';
import { mapRouteRevision } from '../library/library.models';
import { PrismaService } from '../prisma/prisma.service';
import { SyncService } from '../sync/sync.service';
import { fixtureInput } from './route-assistant.fixture';
import {
  createAssistantProposal,
  haversineMeters,
} from './route-assistant.geometry';
import { AssistantRunInput, AssistantWaypoint } from './route-assistant.models';

type Waypoint = {
  sequence: number;
  latitude: number;
  longitude: number;
  speedKmh: number | null;
  pauseSeconds: number | null;
};
const fixture = JSON.parse(
  readFileSync(
    resolve(
      __dirname,
      '../../../app/src/test/resources/route-assistant-path.json',
    ),
    'utf8',
  ),
) as {
  id: string;
  name: string;
  description: null;
  defaultSpeedKmh: number;
  createdAt: string;
  updatedAt: string;
  currentRevision: {
    id: string;
    createdAt: string;
    createdBy: string;
    revisionNumber: number;
    waypoints: Waypoint[];
  };
  assistantCapture: {
    transform: AssistantRunInput['snapshot']['transform'];
    entries: unknown[];
  };
};

function proposal() {
  const input = fixtureInput();
  const event = fixture.currentRevision.waypoints[0];
  input.snapshot.waypoints = [
    {
      draftId: 'event',
      latitude: event.latitude,
      longitude: event.longitude,
      speedKmh: event.speedKmh,
      pauseSeconds: event.pauseSeconds,
    },
  ];
  input.snapshot.visibleMarkers = [
    { draftId: 'event', label: '1', u: 0, v: 0 },
  ];
  input.snapshot.transform = fixture.assistantCapture.transform;
  return createAssistantProposal(input, fixture.assistantCapture.entries);
}

function revisionWaypoint(
  point: AssistantWaypoint,
  sequence: number,
): Waypoint {
  return {
    latitude: point.latitude,
    longitude: point.longitude,
    speedKmh: point.speedKmh,
    pauseSeconds: point.pauseSeconds,
    sequence,
  };
}

describe('screenshot path cross-platform compatibility', () => {
  it('converts captured positions to the exact shared final geometry and events', () => {
    const result = proposal();
    expect(result.waypoints.map(revisionWaypoint)).toEqual(
      fixture.currentRevision.waypoints,
    );
    expect(result.waypoints.map((p) => p.draftId)).toEqual([
      'event',
      'run:1',
      'run:2',
    ]);
    expect(result.removedEventIds).toEqual([]);
    const points = fixture.currentRevision.waypoints;
    expect(result.distanceMeters).toBe(
      haversineMeters(points[0], points[1]) +
        haversineMeters(points[1], points[2]),
    );
    expect(
      haversineMeters(
        { latitude: 0, longitude: 0 },
        { latitude: 0, longitude: 1 },
      ),
    ).toBeCloseTo((6371000 * Math.PI) / 180, 8);
  });

  it.each(Object.values(RouteMode))(
    'preserves final arrays in revision JSON and bootstrap for %s',
    async (mode) => {
      const waypoints = proposal().waypoints.map(revisionWaypoint);
      const revision = {
        ...fixture.currentRevision,
        createdAt: new Date(fixture.currentRevision.createdAt),
        payload: JSON.parse(
          JSON.stringify({
            defaultSpeedKmh: fixture.defaultSpeedKmh,
            mode,
            waypoints: [...waypoints].reverse(),
          }),
        ) as {
          defaultSpeedKmh: number;
          mode: RouteMode;
          waypoints: Waypoint[];
        },
      };
      const mapped = mapRouteRevision(revision);
      expect(mapped.waypoints).toEqual(fixture.currentRevision.waypoints);
      expect(mapped.mode).toBe(mode);
      const route = {
        ...fixture,
        createdAt: new Date(fixture.createdAt),
        updatedAt: new Date(fixture.updatedAt),
        deletedAt: null,
        isPublic: false,
        libraryItem: null,
        mode,
        currentRevision: revision,
      };
      const prisma = {
        route: { findMany: jest.fn().mockResolvedValue([route]) },
        place: { findMany: jest.fn().mockResolvedValue([]) },
        libraryItem: { findMany: jest.fn().mockResolvedValue([]) },
        syncEvent: { findFirst: jest.fn().mockResolvedValue({ id: 7n }) },
      };
      const result = await new SyncService(
        prisma as unknown as PrismaService,
      ).bootstrap('fixture-user');
      const json = JSON.parse(JSON.stringify(result)) as {
        routes: { mode: RouteMode; currentRevision: typeof mapped }[];
        syncCursor: string;
      };
      expect(json.routes[0].currentRevision.waypoints).toEqual(waypoints);
      expect(json.routes[0].currentRevision.waypoints).toEqual(
        fixture.currentRevision.waypoints,
      );
      expect(json.routes[0].mode).toBe(mode);
      expect(json.routes[0].currentRevision.mode).toBe(mode);
      expect(json.syncCursor).toBe('7');
      expect(prisma.route.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { deletedAt: null, userId: 'fixture-user' },
        }),
      );
    },
  );
});
