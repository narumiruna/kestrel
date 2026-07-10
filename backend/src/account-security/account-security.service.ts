import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DevicePlatform } from '@prisma/client';
import {
  AuthAuditMetadata,
  AuthAuditService,
} from '../auth/auth-audit.service';
import { AuthService } from '../auth/auth.service';
import { SessionRevocationService } from '../auth/session-revocation.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AccountSecurityService {
  private readonly logger = new Logger(AccountSecurityService.name);

  constructor(
    private readonly authService: AuthService,
    private readonly authAuditService: AuthAuditService,
    private readonly prismaService: PrismaService,
    private readonly sessionRevocationService: SessionRevocationService,
  ) {}

  async listSessions(userId: string, currentSessionId: string) {
    const now = new Date();
    const sessions = await this.prismaService.session.findMany({
      orderBy: [{ lastUsedAt: 'desc' }, { createdAt: 'desc' }],
      select: {
        createdAt: true,
        expiresAt: true,
        id: true,
        ipAddress: true,
        lastUsedAt: true,
        userAgent: true,
      },
      where: {
        expiresAt: { gt: now },
        revokedAt: null,
        userId,
      },
    });

    return {
      serverTime: now,
      sessions: sessions.map((session) => ({
        ...session,
        isCurrent: session.id === currentSessionId,
      })),
    };
  }

  async revokeSession(
    userId: string,
    currentSessionId: string,
    targetSessionId: string,
    body: unknown,
    metadata: AuthAuditMetadata = {},
  ) {
    const session = await this.prismaService.session.findFirst({
      select: { id: true, revokedAt: true },
      where: { id: targetSessionId, userId },
    });

    if (session == null) {
      throw new NotFoundException('session not found');
    }

    const isCurrent = targetSessionId === currentSessionId;
    if (!isCurrent) {
      await this.confirmStepUp(
        userId,
        currentSessionId,
        parseCurrentPassword(body),
        'session_revoke_target',
        metadata,
      );
    }

    const revokedAt = session.revokedAt ?? new Date();
    if (session.revokedAt == null) {
      await this.sessionRevocationService.revokeSessions(
        userId,
        [targetSessionId],
        revokedAt,
      );
    }
    await this.safeAuditLog({
      ...metadata,
      authMethod: isCurrent ? 'access_token' : 'password',
      event: 'session_revoke_target',
      outcome: 'success',
      sessionId: currentSessionId,
      userId,
    });

    return {
      session: { id: targetSessionId, isCurrent, revokedAt },
    };
  }

  async revokeOtherSessions(
    userId: string,
    currentSessionId: string,
    body: unknown,
    metadata: AuthAuditMetadata = {},
  ) {
    await this.confirmStepUp(
      userId,
      currentSessionId,
      parseCurrentPassword(body),
      'sessions_revoke_others',
      metadata,
    );
    const now = new Date();
    const sessions = await this.prismaService.session.findMany({
      select: { id: true },
      where: {
        expiresAt: { gt: now },
        id: { not: currentSessionId },
        revokedAt: null,
        userId,
      },
    });
    const sessionIds = sessions.map((session) => session.id);
    if (sessionIds.length > 0) {
      await this.sessionRevocationService.revokeSessions(
        userId,
        sessionIds,
        now,
      );
    }
    await this.safeAuditLog({
      ...metadata,
      authMethod: 'password',
      event: 'sessions_revoke_others',
      outcome: 'success',
      sessionId: currentSessionId,
      userId,
    });

    return { revokedSessionIds: sessionIds, revokedAt: now };
  }

  async revokeDevice(
    userId: string,
    currentSessionId: string,
    deviceId: string,
    body: unknown,
    metadata: AuthAuditMetadata = {},
  ) {
    const device = await this.prismaService.device.findFirst({
      select: { id: true, name: true, platform: true, revokedAt: true },
      where: { id: deviceId, platform: DevicePlatform.ANDROID, userId },
    });

    if (device == null) {
      throw new NotFoundException('device not found');
    }

    await this.confirmStepUp(
      userId,
      currentSessionId,
      parseCurrentPassword(body),
      'device_revoke',
      metadata,
    );
    const revokedAt = device.revokedAt ?? new Date();
    if (device.revokedAt == null) {
      await this.sessionRevocationService.revokeDevice(
        userId,
        deviceId,
        revokedAt,
      );
    }
    await this.safeAuditLog({
      ...metadata,
      authMethod: 'password',
      event: 'device_revoke',
      outcome: 'success',
      sessionId: currentSessionId,
      userId,
    });

    return {
      device: { id: device.id, name: device.name, revokedAt },
    };
  }

  private async confirmStepUp(
    userId: string,
    currentSessionId: string,
    currentPassword: string,
    event: string,
    metadata: AuthAuditMetadata,
  ): Promise<void> {
    try {
      await this.authService.confirmCurrentPassword(userId, currentPassword);
    } catch (error) {
      await this.safeAuditLog({
        ...metadata,
        authMethod: 'password',
        event,
        failureReason: 'step_up_failed',
        outcome: 'failure',
        sessionId: currentSessionId,
        userId,
      });
      throw error;
    }
  }

  private async safeAuditLog(
    entry: Parameters<AuthAuditService['log']>[0],
  ): Promise<void> {
    try {
      await this.authAuditService.log(entry);
    } catch (error) {
      this.logger.warn(
        `failed to persist auth audit log for ${entry.event}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}

function parseCurrentPassword(input: unknown): string {
  if (input == null || typeof input !== 'object' || Array.isArray(input)) {
    throw new BadRequestException('currentPassword is required');
  }

  const currentPassword = (input as Record<string, unknown>).currentPassword;
  if (
    typeof currentPassword !== 'string' ||
    currentPassword.length === 0 ||
    currentPassword.length > 256
  ) {
    throw new BadRequestException('currentPassword is invalid');
  }

  return currentPassword;
}
