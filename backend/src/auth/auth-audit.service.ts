import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Client metadata captured from the current HTTP request and attached to auth
 * audit log entries when available.
 */
export type AuthAuditMetadata = {
  ipAddress?: string;
  userAgent?: string;
};

type AuthAuditEntry = AuthAuditMetadata & {
  authMethod?: string;
  event: string;
  failureReason?: string;
  outcome: 'failure' | 'success';
  sessionId?: string;
  userId?: string;
  username?: string;
};

@Injectable()
export class AuthAuditService {
  constructor(private readonly prismaService: PrismaService) {}

  async log(entry: AuthAuditEntry) {
    await this.prismaService.authAuditLog.create({
      data: {
        authMethod: entry.authMethod,
        event: entry.event,
        failureReason: entry.failureReason,
        ipAddress: entry.ipAddress,
        outcome: entry.outcome,
        sessionId: entry.sessionId,
        userAgent: entry.userAgent,
        userId: entry.userId,
        username: entry.username,
      },
    });
  }
}
