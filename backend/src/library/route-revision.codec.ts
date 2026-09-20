import { InternalServerErrorException } from '../http/errors';
import { type Prisma, RouteMode } from '@prisma/client';

export type StoredRouteRevisionPayload = {
  defaultSpeedKmh: number;
  mode: RouteMode;
  waypoints: StoredRouteWaypoint[];
};

export type StoredRouteWaypoint = {
  latitude: number;
  longitude: number;
  pauseSeconds: number | null;
  sequence: number;
  speedKmh: number | null;
};

type RouteRevisionInput = {
  defaultSpeedKmh: number;
  mode: RouteMode;
  waypoints: Array<{
    latitude: number;
    longitude: number;
    pauseSeconds: number | null;
    sequence?: number;
    speedKmh: number | null;
  }>;
};

export function createRouteRevisionPayload(
  input: RouteRevisionInput,
): Prisma.InputJsonObject {
  return {
    defaultSpeedKmh: input.defaultSpeedKmh,
    mode: input.mode,
    waypoints: input.waypoints.map((waypoint, index) => ({
      latitude: waypoint.latitude,
      longitude: waypoint.longitude,
      pauseSeconds: waypoint.pauseSeconds,
      sequence: waypoint.sequence ?? index,
      speedKmh: waypoint.speedKmh,
    })),
  };
}

export function parseStoredRouteRevisionPayload(
  payload: Prisma.JsonValue,
): StoredRouteRevisionPayload {
  if (
    payload == null ||
    typeof payload !== 'object' ||
    Array.isArray(payload)
  ) {
    throw new InternalServerErrorException(
      'stored route revision payload is invalid',
    );
  }

  const payloadRecord = payload as Record<string, unknown>;
  const defaultSpeedKmh = payloadRecord.defaultSpeedKmh;
  const mode = payloadRecord.mode;
  const waypoints = payloadRecord.waypoints;

  if (
    typeof defaultSpeedKmh !== 'number' ||
    !Number.isFinite(defaultSpeedKmh) ||
    !Object.values(RouteMode).includes(mode as RouteMode) ||
    !Array.isArray(waypoints)
  ) {
    throw new InternalServerErrorException(
      'stored route revision payload is invalid',
    );
  }

  const parsedWaypoints = waypoints.map((waypoint, index) =>
    parseStoredRouteWaypoint(waypoint, index),
  );

  parsedWaypoints.sort((left, right) => left.sequence - right.sequence);

  return {
    defaultSpeedKmh,
    mode: mode as RouteMode,
    waypoints: parsedWaypoints,
  };
}

function parseStoredRouteWaypoint(
  waypoint: unknown,
  index: number,
): StoredRouteWaypoint {
  if (
    waypoint == null ||
    typeof waypoint !== 'object' ||
    Array.isArray(waypoint)
  ) {
    throw new InternalServerErrorException(
      `stored route waypoint ${index} is invalid`,
    );
  }

  const waypointRecord = waypoint as Record<string, unknown>;
  const latitude = waypointRecord.latitude;
  const longitude = waypointRecord.longitude;
  const pauseSeconds = waypointRecord.pauseSeconds;
  const sequence = waypointRecord.sequence;
  const speedKmh = waypointRecord.speedKmh;

  if (
    typeof latitude !== 'number' ||
    !Number.isFinite(latitude) ||
    typeof longitude !== 'number' ||
    !Number.isFinite(longitude) ||
    !isNullableFiniteNumber(pauseSeconds) ||
    typeof sequence !== 'number' ||
    !Number.isInteger(sequence) ||
    !isNullableFiniteNumber(speedKmh)
  ) {
    throw new InternalServerErrorException(
      `stored route waypoint ${index} is invalid`,
    );
  }

  return {
    latitude,
    longitude,
    pauseSeconds,
    sequence,
    speedKmh,
  };
}

function isNullableFiniteNumber(value: unknown): value is number | null {
  return value == null || (typeof value === 'number' && Number.isFinite(value));
}
