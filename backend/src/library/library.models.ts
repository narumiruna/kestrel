import { InternalServerErrorException } from '../http/errors';
import type { Prisma } from '@prisma/client';
import { parseStoredRouteRevisionPayload } from './route-revision.codec';

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
  const payload = parseStoredRouteRevisionPayload(revision.payload);

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
