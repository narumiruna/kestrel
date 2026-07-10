import { Injectable } from '@nestjs/common';
import { RemoteCommandStatus, type Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const REVOKED_COMMAND_MESSAGE = 'device or session revoked';

type RevocationStore = Pick<
  Prisma.TransactionClient,
  'device' | 'remoteCommand' | 'session'
>;

@Injectable()
export class SessionRevocationService {
  constructor(private readonly prismaService: PrismaService) {}

  async revokeSessions(
    userId: string,
    sessionIds: string[],
    revokedAt: Date = new Date(),
  ) {
    return this.prismaService.$transaction(async (tx) => {
      const devices = await tx.device.findMany({
        select: { id: true },
        where: {
          registeredSessionId: { in: sessionIds },
          userId,
        },
      });

      return revokeRecords(
        tx,
        userId,
        sessionIds,
        devices.map((device) => device.id),
        revokedAt,
      );
    });
  }

  async revokeDevice(
    userId: string,
    deviceId: string,
    revokedAt: Date = new Date(),
  ) {
    return this.prismaService.$transaction(async (tx) => {
      const devices = await tx.device.findMany({
        select: { id: true, registeredSessionId: true },
        where: { id: deviceId, userId },
      });
      const sessionIds = devices.flatMap((device) =>
        device.registeredSessionId == null ? [] : [device.registeredSessionId],
      );

      return revokeRecords(
        tx,
        userId,
        sessionIds,
        devices.map((device) => device.id),
        revokedAt,
      );
    });
  }
}

async function revokeRecords(
  tx: RevocationStore,
  userId: string,
  sessionIds: string[],
  deviceIds: string[],
  revokedAt: Date,
) {
  const sessions =
    sessionIds.length === 0
      ? { count: 0 }
      : await tx.session.updateMany({
          data: { revokedAt },
          where: {
            id: { in: sessionIds },
            revokedAt: null,
            userId,
          },
        });
  const devices =
    deviceIds.length === 0
      ? { count: 0 }
      : await tx.device.updateMany({
          data: { remoteControlEnabled: false, revokedAt },
          where: { id: { in: deviceIds }, userId },
        });
  const commands =
    deviceIds.length === 0
      ? { count: 0 }
      : await tx.remoteCommand.updateMany({
          data: {
            errorMessage: REVOKED_COMMAND_MESSAGE,
            status: RemoteCommandStatus.EXPIRED,
          },
          where: {
            deviceId: { in: deviceIds },
            status: RemoteCommandStatus.QUEUED,
            userId,
          },
        });

  return {
    commandsExpired: commands.count,
    devicesRevoked: devices.count,
    sessionsRevoked: sessions.count,
  };
}
