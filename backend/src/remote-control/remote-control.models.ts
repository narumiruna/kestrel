import {
  RemoteCommandStatus,
  type Prisma,
  type RemoteCommandStatus as RemoteCommandStatusType,
} from '@prisma/client';

export const REMOTE_DEVICE_ONLINE_MS = 90_000;

export const remoteCommandSelect = {
  appliedAt: true,
  createdAt: true,
  deliveredAt: true,
  deviceId: true,
  errorMessage: true,
  expiresAt: true,
  id: true,
  payload: true,
  status: true,
  type: true,
} satisfies Prisma.RemoteCommandSelect;

export const remoteDeviceSelect = {
  appVersion: true,
  createdAt: true,
  id: true,
  lastSeenAt: true,
  name: true,
  platform: true,
  remoteCommands: {
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: remoteCommandSelect,
    take: 1,
  },
  remoteControlEnabled: true,
  revokedAt: true,
  state: {
    select: {
      lastReportedAt: true,
      playbackState: true,
    },
  },
} satisfies Prisma.DeviceSelect;

type RemoteCommandRecord = Prisma.RemoteCommandGetPayload<{
  select: typeof remoteCommandSelect;
}>;

type RemoteDeviceRecord = Prisma.DeviceGetPayload<{
  select: typeof remoteDeviceSelect;
}>;

export function mapRemoteCommand(command: RemoteCommandRecord) {
  return {
    appliedAt: command.appliedAt,
    createdAt: command.createdAt,
    deliveredAt: command.deliveredAt,
    deviceId: command.deviceId,
    errorMessage: command.errorMessage,
    expiresAt: command.expiresAt,
    id: command.id,
    payload: command.payload,
    status: command.status,
    type: command.type,
  };
}

export function mapRemoteDevice(device: RemoteDeviceRecord, now = new Date()) {
  return {
    appVersion: device.appVersion,
    createdAt: device.createdAt,
    id: device.id,
    lastCommand:
      device.remoteCommands[0] == null
        ? null
        : mapRemoteCommand(device.remoteCommands[0]),
    lastSeenAt: device.lastSeenAt,
    name: device.name,
    online:
      now.getTime() - device.lastSeenAt.getTime() <= REMOTE_DEVICE_ONLINE_MS,
    platform: device.platform,
    remoteControlEnabled: device.remoteControlEnabled,
    revokedAt: device.revokedAt,
    state: device.state,
  };
}

export function isTerminalRemoteCommandStatus(
  status: RemoteCommandStatusType,
): boolean {
  return (
    status === RemoteCommandStatus.APPLIED ||
    status === RemoteCommandStatus.FAILED ||
    status === RemoteCommandStatus.EXPIRED
  );
}
