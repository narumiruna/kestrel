import { BadRequestException } from '@nestjs/common';
import {
  RemoteCommandStatus,
  RemoteCommandType,
  RouteMode,
  type RemoteCommandStatus as RemoteCommandStatusType,
} from '@prisma/client';

const DEFAULT_EXPIRES_MS = 60_000;
const MAX_EXPIRES_MS = 60_000;
const MAX_APP_VERSION_LENGTH = 64;
const MAX_CLIENT_DEVICE_ID_LENGTH = 128;
const MAX_ERROR_MESSAGE_LENGTH = 1024;
const MAX_NAME_LENGTH = 128;
const MAX_WAYPOINT_COUNT = 1000;
const MIN_WAYPOINT_COUNT = 2;

type RemotePoint = {
  latitude: number;
  longitude: number;
};

export type RegisterDeviceInput = {
  appVersion: string | null;
  clientDeviceId: string;
  name: string;
  remoteControlEnabled: boolean;
};

export type CreateRemoteCommandInput = {
  expiresAt: Date;
  payload: RemoteCommandPayload;
  type: RemoteCommandType;
};

export type RemoteCommandPayload =
  | { point: RemotePoint }
  | { mode: RouteMode; speedKmh: number; waypoints: RemotePoint[] }
  | Record<string, never>;

export type PollRemoteCommandsInput = {
  clientDeviceId: string;
};

type AckRemoteCommandStatus = Extract<
  RemoteCommandStatusType,
  'APPLIED' | 'FAILED'
>;

export type AckRemoteCommandInput = {
  clientDeviceId: string;
  errorMessage: string | null;
  status: AckRemoteCommandStatus;
};

export function parseRegisterDeviceInput(input: unknown): RegisterDeviceInput {
  const record = parseRecord(input);

  return {
    appVersion: parseOptionalBoundedString(
      record.appVersion,
      'appVersion',
      MAX_APP_VERSION_LENGTH,
    ),
    clientDeviceId: parseRequiredBoundedString(
      record.clientDeviceId,
      'clientDeviceId',
      MAX_CLIENT_DEVICE_ID_LENGTH,
    ),
    name: parseRequiredBoundedString(record.name, 'name', MAX_NAME_LENGTH),
    remoteControlEnabled: parseRequiredBoolean(
      record.remoteControlEnabled,
      'remoteControlEnabled',
    ),
  };
}

export function parseCreateRemoteCommandInput(
  input: unknown,
  now = new Date(),
): CreateRemoteCommandInput {
  const record = parseRecord(input);
  const type = parseRemoteCommandType(record.type);

  return {
    expiresAt: parseExpiresAt(record.expiresAt, now),
    payload: parsePayload(type, record.payload),
    type,
  };
}

export function parsePollRemoteCommandsInput(
  input: unknown,
): PollRemoteCommandsInput {
  const record = parseRecord(input);

  return {
    clientDeviceId: parseRequiredBoundedString(
      record.clientDeviceId,
      'clientDeviceId',
      MAX_CLIENT_DEVICE_ID_LENGTH,
    ),
  };
}

export function parseAckRemoteCommandInput(
  input: unknown,
): AckRemoteCommandInput {
  const record = parseRecord(input);
  const status = parseAckStatus(record.status);

  return {
    clientDeviceId: parseRequiredBoundedString(
      record.clientDeviceId,
      'clientDeviceId',
      MAX_CLIENT_DEVICE_ID_LENGTH,
    ),
    errorMessage: parseOptionalBoundedString(
      record.errorMessage,
      'errorMessage',
      MAX_ERROR_MESSAGE_LENGTH,
    ),
    status,
  };
}

function parsePayload(
  type: RemoteCommandType,
  payload: unknown,
): RemoteCommandPayload {
  switch (type) {
    case RemoteCommandType.SET_POINT:
      return parseSetPointPayload(payload);
    case RemoteCommandType.START_ROUTE:
      return parseStartRoutePayload(payload);
    case RemoteCommandType.STOP:
      if (payload == null) return {};
      parseRecord(payload);
      return {};
  }
}

function parseSetPointPayload(payload: unknown): { point: RemotePoint } {
  const record = parseRecord(payload);

  return {
    point: parsePoint(record.point, 'point'),
  };
}

function parseStartRoutePayload(payload: unknown): {
  mode: RouteMode;
  speedKmh: number;
  waypoints: RemotePoint[];
} {
  const record = parseRecord(payload);

  return {
    mode: parseRouteMode(record.mode),
    speedKmh: parsePositiveFiniteNumber(record.speedKmh, 'speedKmh'),
    waypoints: parseWaypoints(record.waypoints),
  };
}

function parseWaypoints(value: unknown): RemotePoint[] {
  if (!Array.isArray(value)) {
    throw new BadRequestException('waypoints must be an array');
  }

  if (value.length < MIN_WAYPOINT_COUNT || value.length > MAX_WAYPOINT_COUNT) {
    throw new BadRequestException(
      `waypoints must contain between ${MIN_WAYPOINT_COUNT} and ${MAX_WAYPOINT_COUNT} entries`,
    );
  }

  return value.map((waypoint, index) =>
    parsePoint(waypoint, `waypoints[${index}]`),
  );
}

function parsePoint(value: unknown, field: string): RemotePoint {
  const record = parseRecord(value, `${field} must be an object`);

  return {
    latitude: parseFiniteNumberInRange(
      record.latitude,
      `${field}.latitude`,
      -90,
      90,
    ),
    longitude: parseFiniteNumberInRange(
      record.longitude,
      `${field}.longitude`,
      -180,
      180,
    ),
  };
}

function parseRouteMode(value: unknown): RouteMode {
  if (typeof value !== 'string') {
    throw new BadRequestException('mode must be a string');
  }

  const normalizedMode = value.trim().toUpperCase();

  if (!Object.values(RouteMode).includes(normalizedMode as RouteMode)) {
    throw new BadRequestException('mode must be ONCE, LOOP, or PING_PONG');
  }

  return normalizedMode as RouteMode;
}

function parseRemoteCommandType(value: unknown): RemoteCommandType {
  if (typeof value !== 'string') {
    throw new BadRequestException('type must be a string');
  }

  const normalizedType = value.trim().toUpperCase();

  if (
    !Object.values(RemoteCommandType).includes(
      normalizedType as RemoteCommandType,
    )
  ) {
    throw new BadRequestException(
      'type must be SET_POINT, START_ROUTE, or STOP',
    );
  }

  return normalizedType as RemoteCommandType;
}

function parseAckStatus(value: unknown): AckRemoteCommandStatus {
  if (typeof value !== 'string') {
    throw new BadRequestException('status must be a string');
  }

  const normalizedStatus = value.trim().toUpperCase();

  if (normalizedStatus === RemoteCommandStatus.APPLIED) {
    return RemoteCommandStatus.APPLIED;
  }

  if (normalizedStatus === RemoteCommandStatus.FAILED) {
    return RemoteCommandStatus.FAILED;
  }

  throw new BadRequestException('status must be APPLIED or FAILED');
}

function parseExpiresAt(value: unknown, now: Date): Date {
  if (value == null) {
    return new Date(now.getTime() + DEFAULT_EXPIRES_MS);
  }

  if (typeof value !== 'string') {
    throw new BadRequestException('expiresAt must be an ISO timestamp');
  }

  const expiresAt = new Date(value);

  if (Number.isNaN(expiresAt.getTime())) {
    throw new BadRequestException('expiresAt must be an ISO timestamp');
  }

  if (expiresAt.getTime() <= now.getTime()) {
    throw new BadRequestException('expiresAt must be in the future');
  }

  if (expiresAt.getTime() > now.getTime() + MAX_EXPIRES_MS) {
    throw new BadRequestException('expiresAt must be within 60 seconds');
  }

  return expiresAt;
}

function parseRecord(
  input: unknown,
  message = 'request body must be an object',
): Record<string, unknown> {
  if (input == null || typeof input !== 'object' || Array.isArray(input)) {
    throw new BadRequestException(message);
  }

  return input as Record<string, unknown>;
}

function parseRequiredBoundedString(
  value: unknown,
  field: string,
  maxLength: number,
): string {
  if (typeof value !== 'string') {
    throw new BadRequestException(`${field} must be a string`);
  }

  const normalized = value.trim();

  if (normalized.length === 0 || normalized.length > maxLength) {
    throw new BadRequestException(
      `${field} must be between 1 and ${maxLength} characters`,
    );
  }

  return normalized;
}

function parseOptionalBoundedString(
  value: unknown,
  field: string,
  maxLength: number,
): string | null {
  if (value == null) {
    return null;
  }

  if (typeof value !== 'string') {
    throw new BadRequestException(`${field} must be a string or null`);
  }

  const normalized = value.trim();

  if (normalized.length > maxLength) {
    throw new BadRequestException(
      `${field} must be at most ${maxLength} characters`,
    );
  }

  return normalized === '' ? null : normalized;
}

function parseRequiredBoolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') {
    throw new BadRequestException(`${field} must be a boolean`);
  }

  return value;
}

function parsePositiveFiniteNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new BadRequestException(`${field} must be a finite positive number`);
  }

  return value;
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
