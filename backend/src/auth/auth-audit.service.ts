import { createLogger } from '../logger';
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

export class AuthAuditService {
  private readonly logger = createLogger(AuthAuditService.name);

  constructor(private readonly prismaService: PrismaService) {}

  async log(entry: AuthAuditEntry) {
    this.emitOperationalLog(entry);

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

  /**
   * Mirrors the audit trail to stdout so operators can follow auth activity
   * without database access. Username, IP address, and user agent stay in the
   * database only.
   */
  private emitOperationalLog(entry: AuthAuditEntry): void {
    const record = {
      authMethod: entry.authMethod,
      event: entry.event,
      failureReason: entry.failureReason,
      outcome: entry.outcome,
      sessionId: entry.sessionId,
      userId: entry.userId,
    };

    if (entry.outcome === 'failure') {
      this.logger.warn(record, 'auth event failed');
    } else {
      this.logger.info(record, 'auth event');
    }
  }
}
