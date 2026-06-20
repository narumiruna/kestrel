import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DevicePlatform,
  RemoteCommandStatus,
  type Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  isTerminalRemoteCommandStatus,
  mapRemoteCommand,
  mapRemoteDevice,
  remoteCommandSelect,
  remoteDeviceSelect,
} from './remote-control.models';
import {
  parseAckRemoteCommandInput,
  parseCreateRemoteCommandInput,
  parsePollRemoteCommandsInput,
  parseRegisterDeviceInput,
} from './remote-control.validation';

const ACK_TIMEOUT_MS = 120_000;
const COMMAND_BATCH_SIZE = 10;
const COMMAND_ACK_TIMEOUT_MESSAGE = 'command ack timed out';
const COMMAND_EXPIRED_MESSAGE = 'command expired before delivery';
const REMOTE_CONTROL_DISABLED_MESSAGE = 'remote control disabled';

type RemoteControlStore = Pick<
  Prisma.TransactionClient,
  'device' | 'remoteCommand'
>;

@Injectable()
export class RemoteControlService {
  constructor(private readonly prismaService: PrismaService) {}

  async registerDevice(userId: string, body: unknown) {
    const input = parseRegisterDeviceInput(body);
    const now = new Date();
    const device = await this.prismaService.device.upsert({
      create: {
        appVersion: input.appVersion,
        clientDeviceId: input.clientDeviceId,
        lastSeenAt: now,
        name: input.name,
        platform: DevicePlatform.ANDROID,
        remoteControlEnabled: input.remoteControlEnabled,
        userId,
      },
      select: remoteDeviceSelect,
      update: {
        appVersion: input.appVersion,
        lastSeenAt: now,
        name: input.name,
        platform: DevicePlatform.ANDROID,
        remoteControlEnabled: input.remoteControlEnabled,
      },
      where: {
        userId_clientDeviceId: {
          clientDeviceId: input.clientDeviceId,
          userId,
        },
      },
    });

    return mapRemoteDevice(device, now);
  }

  async listDevices(userId: string) {
    const now = new Date();
    await this.expireStaleCommands(this.prismaService, now, { userId });
    const devices = await this.prismaService.device.findMany({
      orderBy: [{ lastSeenAt: 'desc' }, { createdAt: 'asc' }],
      select: remoteDeviceSelect,
      where: {
        platform: DevicePlatform.ANDROID,
        userId,
      },
    });

    return {
      devices: devices.map((device) => mapRemoteDevice(device, now)),
      serverTime: now,
    };
  }

  async createCommand(userId: string, deviceId: string, body: unknown) {
    const now = new Date();
    const input = parseCreateRemoteCommandInput(body, now);
    const device = await this.prismaService.device.findFirst({
      select: {
        id: true,
        remoteControlEnabled: true,
      },
      where: {
        id: deviceId,
        platform: DevicePlatform.ANDROID,
        userId,
      },
    });

    if (device == null) {
      throw new NotFoundException('device not found');
    }

    if (!device.remoteControlEnabled) {
      throw new ConflictException('remote control is disabled for this device');
    }

    const command = await this.prismaService.remoteCommand.create({
      data: {
        deviceId: device.id,
        expiresAt: input.expiresAt,
        payload: input.payload,
        type: input.type,
        userId,
      },
      select: remoteCommandSelect,
    });

    return mapRemoteCommand(command);
  }

  async pollCommands(userId: string, deviceId: string, body: unknown) {
    const input = parsePollRemoteCommandsInput(body);
    const now = new Date();

    return this.prismaService.$transaction(async (tx) => {
      const device = await this.assertOwnDevice(
        tx,
        userId,
        deviceId,
        input.clientDeviceId,
      );
      await this.expireStaleCommands(tx, now, { deviceId, userId });

      if (!device.remoteControlEnabled) {
        await tx.remoteCommand.updateMany({
          data: {
            errorMessage: REMOTE_CONTROL_DISABLED_MESSAGE,
            status: RemoteCommandStatus.EXPIRED,
          },
          where: {
            deviceId,
            status: RemoteCommandStatus.QUEUED,
            userId,
          },
        });
        await tx.device.update({
          data: {
            lastSeenAt: now,
          },
          where: {
            id: deviceId,
          },
        });

        return {
          commands: [],
          serverTime: now,
        };
      }

      const queuedCommands = await tx.remoteCommand.findMany({
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: remoteCommandSelect,
        take: COMMAND_BATCH_SIZE,
        where: {
          deviceId,
          expiresAt: {
            gt: now,
          },
          status: RemoteCommandStatus.QUEUED,
          userId,
        },
      });
      const deliveredCommands: typeof queuedCommands = [];

      for (const command of queuedCommands) {
        const delivery = await tx.remoteCommand.updateMany({
          data: {
            deliveredAt: now,
            status: RemoteCommandStatus.DELIVERED,
          },
          where: {
            deviceId,
            id: command.id,
            status: RemoteCommandStatus.QUEUED,
            userId,
          },
        });

        if (delivery.count === 1) {
          deliveredCommands.push(command);
        }
      }

      await tx.device.update({
        data: {
          lastSeenAt: now,
        },
        where: {
          id: deviceId,
        },
      });

      return {
        commands: deliveredCommands.map((command) =>
          mapRemoteCommand({
            ...command,
            deliveredAt: now,
            status: RemoteCommandStatus.DELIVERED,
          }),
        ),
        serverTime: now,
      };
    });
  }

  async ackCommand(
    userId: string,
    deviceId: string,
    commandId: string,
    body: unknown,
  ) {
    const input = parseAckRemoteCommandInput(body);
    const now = new Date();

    return this.prismaService.$transaction(async (tx) => {
      await this.assertOwnDevice(tx, userId, deviceId, input.clientDeviceId);
      await this.expireStaleCommands(tx, now, { deviceId, userId });

      const command = await tx.remoteCommand.findFirst({
        select: remoteCommandSelect,
        where: {
          deviceId,
          id: commandId,
          userId,
        },
      });

      if (command == null) {
        throw new NotFoundException('command not found');
      }

      if (isTerminalRemoteCommandStatus(command.status)) {
        await tx.device.update({
          data: {
            lastSeenAt: now,
          },
          where: {
            id: deviceId,
          },
        });

        return mapRemoteCommand(command);
      }

      if (command.status !== RemoteCommandStatus.DELIVERED) {
        throw new ConflictException('command has not been delivered');
      }

      const ack = await tx.remoteCommand.updateMany({
        data: {
          appliedAt:
            input.status === RemoteCommandStatus.APPLIED ? now : undefined,
          errorMessage:
            input.status === RemoteCommandStatus.FAILED
              ? input.errorMessage
              : null,
          status: input.status,
        },
        where: {
          deviceId,
          id: command.id,
          status: RemoteCommandStatus.DELIVERED,
          userId,
        },
      });
      const updatedCommand = await tx.remoteCommand.findFirst({
        select: remoteCommandSelect,
        where: {
          deviceId,
          id: command.id,
          userId,
        },
      });

      if (updatedCommand == null) {
        throw new NotFoundException('command not found');
      }

      if (
        ack.count === 0 &&
        !isTerminalRemoteCommandStatus(updatedCommand.status)
      ) {
        throw new ConflictException('command has not been delivered');
      }

      await tx.device.update({
        data: {
          lastSeenAt: now,
        },
        where: {
          id: deviceId,
        },
      });

      return mapRemoteCommand(updatedCommand);
    });
  }

  private async assertOwnDevice(
    client: RemoteControlStore,
    userId: string,
    deviceId: string,
    clientDeviceId: string,
  ) {
    const device = await client.device.findFirst({
      select: {
        id: true,
        remoteControlEnabled: true,
      },
      where: {
        clientDeviceId,
        id: deviceId,
        platform: DevicePlatform.ANDROID,
        userId,
      },
    });

    if (device == null) {
      throw new NotFoundException('device not found');
    }

    return device;
  }

  private async expireStaleCommands(
    client: RemoteControlStore,
    now: Date,
    where: {
      deviceId?: string;
      userId: string;
    },
  ) {
    const ackTimeoutBefore = new Date(now.getTime() - ACK_TIMEOUT_MS);

    await client.remoteCommand.updateMany({
      data: {
        errorMessage: COMMAND_EXPIRED_MESSAGE,
        status: RemoteCommandStatus.EXPIRED,
      },
      where: {
        ...where,
        expiresAt: {
          lte: now,
        },
        status: RemoteCommandStatus.QUEUED,
      },
    });
    await client.remoteCommand.updateMany({
      data: {
        errorMessage: COMMAND_ACK_TIMEOUT_MESSAGE,
        status: RemoteCommandStatus.EXPIRED,
      },
      where: {
        ...where,
        deliveredAt: {
          lte: ackTimeoutBefore,
        },
        status: RemoteCommandStatus.DELIVERED,
      },
    });
  }
}
