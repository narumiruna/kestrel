import { BadRequestException } from '@nestjs/common';
import { RouteMode } from '@prisma/client';

const MAX_DESCRIPTION_LENGTH = 1024;
const MAX_NAME_LENGTH = 128;
const MAX_TAG_COUNT = 20;
const MAX_TAG_LENGTH = 64;
const MAX_WAYPOINT_COUNT = 1000;
const MIN_WAYPOINT_COUNT = 2;

export type LibraryItemReorderInput = {
  itemId: string;
  toIndex: number;
};

export type PlaceCreateInput = {
  description: string | null;
  latitude: number;
  longitude: number;
  name: string;
  tags: string[];
};

export type PlaceUpdateInput = Partial<PlaceCreateInput>;

export type RouteCreateInput = {
  defaultSpeedKmh: number;
  description: string | null;
  isPublic: boolean;
  mode: RouteMode;
  name: string;
  waypoints: RouteWaypointInput[];
};

export type RouteUpdateInput = Partial<RouteCreateInput>;

export type RouteWaypointInput = {
  latitude: number;
  longitude: number;
};

export function parseCreatePlaceInput(input: unknown): PlaceCreateInput {
  const inputRecord = parseUnknownRecord(input);

  return {
    description: parseOptionalDescription(inputRecord.description),
    latitude: parseLatitude(inputRecord.latitude),
    longitude: parseLongitude(inputRecord.longitude),
    name: parseName(inputRecord.name),
    tags: parseTags(inputRecord.tags),
  };
}

export function parseUpdatePlaceInput(input: unknown): PlaceUpdateInput {
  const inputRecord = parseUnknownRecord(input);
  const updates: PlaceUpdateInput = {};

  if (hasOwn(inputRecord, 'name')) {
    updates.name = parseName(inputRecord.name);
  }

  if (hasOwn(inputRecord, 'latitude')) {
    updates.latitude = parseLatitude(inputRecord.latitude);
  }

  if (hasOwn(inputRecord, 'longitude')) {
    updates.longitude = parseLongitude(inputRecord.longitude);
  }

  if (hasOwn(inputRecord, 'description')) {
    updates.description = parseOptionalDescription(inputRecord.description);
  }

  if (hasOwn(inputRecord, 'tags')) {
    updates.tags = parseTags(inputRecord.tags);
  }

  assertHasUpdates(updates);

  return updates;
}

export function parseCreateRouteInput(input: unknown): RouteCreateInput {
  const inputRecord = parseUnknownRecord(input);

  return {
    defaultSpeedKmh: parseDefaultSpeedKmh(inputRecord.defaultSpeedKmh),
    description: parseOptionalDescription(inputRecord.description),
    isPublic: parseOptionalBoolean(inputRecord.isPublic) ?? false,
    mode: parseRouteMode(inputRecord.mode),
    name: parseName(inputRecord.name),
    waypoints: parseWaypoints(inputRecord.waypoints),
  };
}

export function parseUpdateRouteInput(input: unknown): RouteUpdateInput {
  const inputRecord = parseUnknownRecord(input);
  const updates: RouteUpdateInput = {};

  if (hasOwn(inputRecord, 'name')) {
    updates.name = parseName(inputRecord.name);
  }

  if (hasOwn(inputRecord, 'description')) {
    updates.description = parseOptionalDescription(inputRecord.description);
  }

  if (hasOwn(inputRecord, 'defaultSpeedKmh')) {
    updates.defaultSpeedKmh = parseDefaultSpeedKmh(inputRecord.defaultSpeedKmh);
  }

  if (hasOwn(inputRecord, 'mode')) {
    updates.mode = parseRouteMode(inputRecord.mode);
  }

  if (hasOwn(inputRecord, 'waypoints')) {
    updates.waypoints = parseWaypoints(inputRecord.waypoints);
  }

  if (hasOwn(inputRecord, 'isPublic')) {
    updates.isPublic = parseOptionalBoolean(inputRecord.isPublic);
  }

  assertHasUpdates(updates);

  return updates;
}

export function parseLibraryItemReorderInput(
  input: unknown,
): LibraryItemReorderInput {
  const inputRecord = parseUnknownRecord(input);

  if (
    typeof inputRecord.itemId !== 'string' ||
    inputRecord.itemId.trim() === ''
  ) {
    throw new BadRequestException('itemId must be a non-empty string');
  }

  if (
    typeof inputRecord.toIndex !== 'number' ||
    !Number.isInteger(inputRecord.toIndex) ||
    inputRecord.toIndex < 0
  ) {
    throw new BadRequestException('toIndex must be a non-negative integer');
  }

  return {
    itemId: inputRecord.itemId,
    toIndex: inputRecord.toIndex,
  };
}

function assertHasUpdates(updates: Record<string, unknown>) {
  if (Object.keys(updates).length === 0) {
    throw new BadRequestException(
      'request body must include at least one updatable field',
    );
  }
}

function hasOwn(input: Record<string, unknown>, key: string): boolean {
  return Object.hasOwn(input, key);
}

function parseUnknownRecord(input: unknown): Record<string, unknown> {
  if (input == null || typeof input !== 'object' || Array.isArray(input)) {
    throw new BadRequestException('request body must be an object');
  }

  return input as Record<string, unknown>;
}

function parseName(value: unknown): string {
  if (typeof value !== 'string') {
    throw new BadRequestException('name must be a string');
  }

  const normalizedName = value.trim();

  if (normalizedName.length === 0 || normalizedName.length > MAX_NAME_LENGTH) {
    throw new BadRequestException(
      `name must be between 1 and ${MAX_NAME_LENGTH} characters`,
    );
  }

  return normalizedName;
}

function parseOptionalDescription(value: unknown): string | null {
  if (value == null) {
    return null;
  }

  if (typeof value !== 'string') {
    throw new BadRequestException('description must be a string or null');
  }

  const normalizedDescription = value.trim();

  if (normalizedDescription.length > MAX_DESCRIPTION_LENGTH) {
    throw new BadRequestException(
      `description must be at most ${MAX_DESCRIPTION_LENGTH} characters`,
    );
  }

  return normalizedDescription === '' ? null : normalizedDescription;
}

function parseLatitude(value: unknown): number {
  return parseFiniteNumberInRange(value, 'latitude', -90, 90);
}

function parseLongitude(value: unknown): number {
  return parseFiniteNumberInRange(value, 'longitude', -180, 180);
}

function parseFiniteNumberInRange(
  value: unknown,
  field: string,
  minimum: number,
  maximum: number,
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new BadRequestException(`${field} must be a finite number`);
  }

  if (value < minimum || value > maximum) {
    throw new BadRequestException(
      `${field} must be between ${minimum} and ${maximum}`,
    );
  }

  return value;
}

function parseTags(value: unknown): string[] {
  if (value == null) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new BadRequestException('tags must be an array of strings');
  }

  if (value.length > MAX_TAG_COUNT) {
    throw new BadRequestException(
      `tags must contain at most ${MAX_TAG_COUNT} values`,
    );
  }

  return value.map((tag, index) => parseTag(tag, index));
}

function parseTag(value: unknown, index: number): string {
  if (typeof value !== 'string') {
    throw new BadRequestException(`tags[${index}] must be a string`);
  }

  const normalizedTag = value.trim();

  if (normalizedTag.length === 0 || normalizedTag.length > MAX_TAG_LENGTH) {
    throw new BadRequestException(
      `tags[${index}] must be between 1 and ${MAX_TAG_LENGTH} characters`,
    );
  }

  return normalizedTag;
}

function parseDefaultSpeedKmh(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new BadRequestException('defaultSpeedKmh must be a positive number');
  }

  return value;
}

function parseRouteMode(value: unknown): RouteMode {
  if (typeof value !== 'string') {
    throw new BadRequestException('mode must be a string');
  }

  const normalizedMode = value.toUpperCase().trim();

  if (!Object.values(RouteMode).includes(normalizedMode as RouteMode)) {
    throw new BadRequestException('mode must be ONCE, LOOP, or PING_PONG');
  }

  return normalizedMode as RouteMode;
}

function parseWaypoints(value: unknown): RouteWaypointInput[] {
  if (!Array.isArray(value)) {
    throw new BadRequestException('waypoints must be an array');
  }

  if (value.length < MIN_WAYPOINT_COUNT || value.length > MAX_WAYPOINT_COUNT) {
    throw new BadRequestException(
      `waypoints must contain between ${MIN_WAYPOINT_COUNT} and ${MAX_WAYPOINT_COUNT} entries`,
    );
  }

  return value.map((waypoint, index) => parseWaypoint(waypoint, index));
}

function parseWaypoint(value: unknown, index: number): RouteWaypointInput {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    throw new BadRequestException(`waypoints[${index}] must be an object`);
  }

  const waypointRecord = value as Record<string, unknown>;

  return {
    latitude: parseLatitude(waypointRecord.latitude),
    longitude: parseLongitude(waypointRecord.longitude),
  };
}

function parseOptionalBoolean(value: unknown): boolean | undefined {
  if (value == null) {
    return undefined;
  }

  if (typeof value !== 'boolean') {
    throw new BadRequestException('isPublic must be a boolean');
  }

  return value;
}
