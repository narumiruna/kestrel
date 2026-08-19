import { InternalServerErrorException } from '../http/errors';
import {
  type Prisma,
  RouteMode,
  type RouteRevision as PrismaRouteRevision,
} from '@prisma/client';

export const libraryItemSelect = {
  createdAt: true,
  deletedAt: true,
  id: true,
  kind: true,
  lastUsedAt: true,
  pinned: true,
  placeId: true,
  routeId: true,
  sortOrder: true,
  updatedAt: true,
  version: true,
} satisfies Prisma.LibraryItemSelect;

export const placeSelect = {
  createdAt: true,
  deletedAt: true,
  description: true,
  id: true,
  latitude: true,
  libraryItem: {
    select: libraryItemSelect,
  },
  longitude: true,
  name: true,
  tags: true,
  updatedAt: true,
} satisfies Prisma.PlaceSelect;

export const routeRevisionSelect = {
  createdAt: true,
  createdBy: true,
  id: true,
  payload: true,
  revisionNumber: true,
} satisfies Prisma.RouteRevisionSelect;

export const routeSelect = {
  createdAt: true,
  currentRevision: {
    select: routeRevisionSelect,
  },
  defaultSpeedKmh: true,
  deletedAt: true,
  description: true,
  id: true,
  isPublic: true,
  libraryItem: {
    select: libraryItemSelect,
  },
  mode: true,
  name: true,
  updatedAt: true,
} satisfies Prisma.RouteSelect;

type LibraryItemRecord = Prisma.LibraryItemGetPayload<{
  select: typeof libraryItemSelect;
}>;

type PlaceRecord = Prisma.PlaceGetPayload<{
  select: typeof placeSelect;
}>;

type RouteRecord = Prisma.RouteGetPayload<{
  select: typeof routeSelect;
}>;

type RouteRevisionPayload = {
  defaultSpeedKmh: number;
  mode: RouteMode;
  waypoints: RouteRevisionWaypoint[];
};

type RouteRevisionWaypoint = {
  latitude: number;
  longitude: number;
  pauseSeconds: number | null;
  sequence: number;
  speedKmh: number | null;
};

export function mapPlace(place: PlaceRecord) {
  return {
    createdAt: place.createdAt,
    deletedAt: place.deletedAt,
    description: place.description,
    id: place.id,
    libraryItem:
      place.libraryItem == null ? null : mapLibraryItem(place.libraryItem),
    latitude: place.latitude,
    longitude: place.longitude,
    name: place.name,
    tags: parseStoredTags(place.tags),
    updatedAt: place.updatedAt,
  };
}

export function mapRoute(route: RouteRecord) {
  return {
    createdAt: route.createdAt,
    currentRevision:
      route.currentRevision == null
        ? null
        : mapRouteRevision(route.currentRevision),
    defaultSpeedKmh: route.defaultSpeedKmh,
    deletedAt: route.deletedAt,
    description: route.description,
    id: route.id,
    isPublic: route.isPublic,
    libraryItem:
      route.libraryItem == null ? null : mapLibraryItem(route.libraryItem),
    mode: route.mode,
    name: route.name,
    updatedAt: route.updatedAt,
  };
}

export function mapLibraryItem(libraryItem: LibraryItemRecord) {
  return {
    createdAt: libraryItem.createdAt,
    deletedAt: libraryItem.deletedAt,
    id: libraryItem.id,
    kind: libraryItem.kind,
    lastUsedAt: libraryItem.lastUsedAt,
    pinned: libraryItem.pinned,
    placeId: libraryItem.placeId,
    routeId: libraryItem.routeId,
    sortOrder: libraryItem.sortOrder,
    updatedAt: libraryItem.updatedAt,
    version: libraryItem.version,
  };
}

export function mapRouteRevision(revision: {
  createdAt: Date;
  createdBy: string;
  id: string;
  payload: Prisma.JsonValue;
  revisionNumber: number;
}) {
  const payload = parseStoredRouteRevisionPayload(revision);

  return {
    createdAt: revision.createdAt,
    createdBy: revision.createdBy,
    defaultSpeedKmh: payload.defaultSpeedKmh,
    id: revision.id,
    mode: payload.mode,
    revisionNumber: revision.revisionNumber,
    waypoints: payload.waypoints,
  };
}

function parseStoredTags(tags: Prisma.JsonValue): string[] {
  if (!Array.isArray(tags) || !tags.every((tag) => typeof tag === 'string')) {
    throw new InternalServerErrorException('stored place tags are invalid');
  }

  return tags;
}

function parseStoredRouteRevisionPayload(
  revision: Pick<PrismaRouteRevision, 'payload'>,
): RouteRevisionPayload {
  const payload = revision.payload;

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
): RouteRevisionWaypoint {
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
  const sequence = waypointRecord.sequence;
  const pauseSeconds = waypointRecord.pauseSeconds;
  const speedKmh = waypointRecord.speedKmh;

  if (
    typeof latitude !== 'number' ||
    !Number.isFinite(latitude) ||
    typeof longitude !== 'number' ||
    !Number.isFinite(longitude) ||
    typeof sequence !== 'number' ||
    !Number.isInteger(sequence) ||
    !isNullableFiniteNumber(pauseSeconds) ||
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
