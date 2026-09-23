import { Prisma } from '@prisma/client';
import QRCode from 'qrcode';
import {
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import { AccessTokenService } from '../auth/access-token.service';
import {
  type AuthAuditMetadata,
  AuthAuditService,
} from '../auth/auth-audit.service';
import { TotpService } from '../auth/totp.service';
import { ConfigService } from '../config.service';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
} from '../http/errors';
import { createLogger } from '../logger';
import { PrismaService } from '../prisma/prisma.service';

const ATTEMPT_LIFETIME_MS = 5 * 60 * 1000;
const EXCHANGE_RECOVERY_LIFETIME_MS = 20 * 60 * 1000;
const RECENT_AUTHENTICATION_WINDOW_MS = 10 * 60 * 1000;
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;
const MINIMUM_POLL_INTERVAL_MS = 5 * 1000;
const MAX_RETAINED_ATTEMPTS = 1000;
const MAX_PRUNED_ATTEMPTS = 100;
const SECRET_BYTES = 32;
const ENCRYPTION_KEY_BYTES = 32;
const ANDROID_LOGIN_PATH = '/login/android';
const BASE64URL_SECRET_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const BASE64URL_VERIFIER_PATTERN = /^[A-Za-z0-9_-]{43,128}$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const attemptSelect = Prisma.validator<Prisma.AndroidLoginAttemptSelect>()({
  approvedAt: true,
  appVersion: true,
  authorizingSession: {
    select: {
      expiresAt: true,
      revokedAt: true,
    },
  },
  authorizingSessionId: true,
  claimedAt: true,
  consumedAt: true,
  deniedAt: true,
  deviceName: true,
  exchangeSessionId: true,
  expiresAt: true,
  id: true,
  lastPolledAt: true,
  qrSecretHash: true,
  user: {
    select: {
      id: true,
      username: true,
    },
  },
  userId: true,
  verifierChallenge: true,
});

type AttemptRecord = Prisma.AndroidLoginAttemptGetPayload<{
  select: typeof attemptSelect;
}>;

type SessionResponse = {
  accessToken: string;
  accessTokenExpiresAt: Date;
  authMethod: 'android_qr';
  refreshToken: string;
  session: {
    createdAt: Date;
    expiresAt: Date;
    id: string;
    lastUsedAt: Date;
  };
  user: {
    id: string;
    username: string;
  };
};

export type AndroidLoginExchangeResult =
  | { retryAfterSeconds: number; status: 'pending' | 'slow_down' }
  | { session: SessionResponse; status: 'complete' };

export class AndroidLoginService {
  private readonly logger = createLogger(AndroidLoginService.name);

  constructor(
    private readonly accessTokenService: AccessTokenService,
    private readonly authAuditService: AuthAuditService,
    private readonly configService: ConfigService,
    private readonly prismaService: PrismaService,
    private readonly totpService: TotpService,
  ) {}

  getMethod(): { enabled: boolean } {
    try {
      return {
        enabled:
          this.isCreationEnabled() && this.getConfiguration(false) != null,
      };
    } catch {
      return { enabled: false };
    }
  }

  async createAttempt(
    userId: string,
    authorizingSessionId: string,
    metadata: AuthAuditMetadata = {},
  ) {
    const configuration = this.requireCreationConfiguration();
    const now = new Date();
    const attemptId = randomUUID();
    const qrSecret = createRandomSecret();
    const expiresAt = new Date(now.getTime() + ATTEMPT_LIFETIME_MS);
    try {
      const qrCodeDataUrl = await this.prismaService.$transaction(
        async (transaction) => {
          const expiredAttempts =
            await transaction.androidLoginAttempt.findMany({
              orderBy: { expiresAt: 'asc' },
              select: { id: true },
              take: MAX_PRUNED_ATTEMPTS,
              where: { expiresAt: { lte: now } },
            });
          if (expiredAttempts.length > 0) {
            await transaction.androidLoginAttempt.deleteMany({
              where: { id: { in: expiredAttempts.map(({ id }) => id) } },
            });
          }
          const session = await transaction.session.findFirst({
            select: { createdAt: true },
            where: {
              expiresAt: { gt: now },
              id: authorizingSessionId,
              revokedAt: null,
              userId,
            },
          });
          if (session == null) {
            throw new GoneException('Web session is no longer active');
          }
          if (
            session.createdAt.getTime() <
            now.getTime() - RECENT_AUTHENTICATION_WINDOW_MS
          ) {
            throw new ForbiddenException({
              code: 'reauthentication_required',
              message: 'Sign in again before creating an Android QR login',
              statusCode: 403,
            });
          }

          await transaction.androidLoginAttempt.updateMany({
            data: { approvedAt: null, deniedAt: now },
            where: {
              authorizingSessionId,
              consumedAt: null,
              deniedAt: null,
              expiresAt: { gt: now },
              userId,
            },
          });
          const retainedAttempts = await transaction.androidLoginAttempt.count({
            where: { expiresAt: { gt: now } },
          });
          if (retainedAttempts >= MAX_RETAINED_ATTEMPTS) {
            throw new ServiceUnavailableException(
              'Android QR login is temporarily unavailable',
            );
          }

          const dataUrl = await QRCode.toDataURL(
            createQrPayload(configuration.publicUrl, attemptId, qrSecret),
            { errorCorrectionLevel: 'M', margin: 1 },
          );
          await transaction.androidLoginAttempt.create({
            data: {
              authorizingSessionId,
              expiresAt,
              id: attemptId,
              qrSecretHash: hashValue(qrSecret),
              userId,
            },
          });
          return dataUrl;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      await this.safeAuditLog({
        ...metadata,
        authMethod: 'access_token',
        event: 'android_qr_create',
        outcome: 'success',
        sessionId: authorizingSessionId,
        userId,
      });
      return {
        attemptId,
        expiresAt,
        pollIntervalSeconds: MINIMUM_POLL_INTERVAL_MS / 1000,
        qrCodeDataUrl,
      };
    } catch (error) {
      await this.safeAuditLog({
        ...metadata,
        authMethod: 'access_token',
        event: 'android_qr_create',
        failureReason:
          error instanceof ForbiddenException
            ? 'reauthentication_required'
            : 'create_failed',
        outcome: 'failure',
        sessionId: authorizingSessionId,
        userId,
      });
      throw error;
    }
  }

  async getAttempt(
    userId: string,
    authorizingSessionId: string,
    attemptId: string,
  ) {
    validateAttemptId(attemptId);
    const attempt = await this.findOwnedAttempt(
      userId,
      authorizingSessionId,
      attemptId,
    );
    return toWebAttempt(attempt, new Date(), this.getConfiguration(false));
  }

  async approveAttempt(
    userId: string,
    authorizingSessionId: string,
    attemptId: string,
    metadata: AuthAuditMetadata = {},
  ) {
    validateAttemptId(attemptId);
    const now = new Date();
    const updated = await this.prismaService.androidLoginAttempt.updateMany({
      data: { approvedAt: now },
      where: {
        approvedAt: null,
        authorizingSession: {
          expiresAt: { gt: now },
          revokedAt: null,
        },
        authorizingSessionId,
        claimedAt: { not: null },
        consumedAt: null,
        deniedAt: null,
        expiresAt: { gt: now },
        id: attemptId,
        userId,
      },
    });
    if (updated.count !== 1) {
      const attempt = await this.findOwnedAttempt(
        userId,
        authorizingSessionId,
        attemptId,
      );
      if (attempt.approvedAt == null) {
        rejectUnavailableWebTransition(attempt, now, 'claim');
      }
    }
    await this.safeAuditLog({
      ...metadata,
      authMethod: 'access_token',
      event: 'android_qr_approve',
      outcome: 'success',
      sessionId: authorizingSessionId,
      userId,
    });
    return this.getAttempt(userId, authorizingSessionId, attemptId);
  }

  async denyAttempt(
    userId: string,
    authorizingSessionId: string,
    attemptId: string,
    metadata: AuthAuditMetadata = {},
  ) {
    validateAttemptId(attemptId);
    const now = new Date();
    const attempt = await this.findOwnedAttempt(
      userId,
      authorizingSessionId,
      attemptId,
    );
    if (attempt.consumedAt != null) {
      throw new ConflictException('Android QR login is already complete');
    }
    if (attempt.deniedAt == null && attempt.expiresAt > now) {
      await this.prismaService.androidLoginAttempt.updateMany({
        data: { approvedAt: null, deniedAt: now },
        where: {
          authorizingSessionId,
          consumedAt: null,
          deniedAt: null,
          id: attemptId,
          userId,
        },
      });
    }
    await this.safeAuditLog({
      ...metadata,
      authMethod: 'access_token',
      event: 'android_qr_deny',
      outcome: 'success',
      sessionId: authorizingSessionId,
      userId,
    });
    return this.getAttempt(userId, authorizingSessionId, attemptId);
  }

  async claimAttempt(input: unknown, metadata: AuthAuditMetadata = {}) {
    const configuration = this.requireConfiguration();
    const request = parseClaimRequest(input);
    const now = new Date();
    let attempt = await this.findAttemptForClient(
      request.attemptId,
      request.qrSecret,
    );
    await this.auditExpiryIfNeeded(attempt, now, metadata);
    rejectTerminalClientAttempt(attempt, now);
    await this.pruneExpiredAttempts(now);

    if (attempt.verifierChallenge == null) {
      await this.prismaService.androidLoginAttempt.updateMany({
        data: {
          appVersion: request.appVersion,
          claimedAt: now,
          deviceName: request.deviceName,
          verifierChallenge: request.verifierChallenge,
        },
        where: {
          claimedAt: null,
          consumedAt: null,
          deniedAt: null,
          expiresAt: { gt: now },
          id: attempt.id,
          verifierChallenge: null,
        },
      });
      attempt = await this.findAttemptForClient(
        request.attemptId,
        request.qrSecret,
      );
    }
    if (attempt.verifierChallenge !== request.verifierChallenge) {
      throw new ConflictException(
        'Android QR login was claimed by another device',
      );
    }

    await this.safeAuditLog({
      ...metadata,
      authMethod: 'android_qr',
      event: 'android_qr_claim',
      outcome: 'success',
      sessionId: attempt.authorizingSessionId,
      userId: attempt.userId,
      username: attempt.user.username,
    });
    return {
      attemptId: attempt.id,
      expiresAt: attempt.expiresAt,
      matchingCode: createMatchingCode(
        configuration.secret,
        attempt.id,
        request.verifierChallenge,
      ),
      pollIntervalSeconds: MINIMUM_POLL_INTERVAL_MS / 1000,
      serverOrigin: configuration.publicUrl,
      user: { username: attempt.user.username },
    };
  }

  async exchangeAttempt(
    input: unknown,
    metadata: AuthAuditMetadata = {},
  ): Promise<AndroidLoginExchangeResult> {
    const configuration = this.requireConfiguration();
    const request = parseExchangeRequest(input);
    const now = new Date();
    let attempt = await this.findAttemptForClient(
      request.attemptId,
      request.qrSecret,
    );
    verifyClientBinding(attempt, request.verifier);

    if (attempt.consumedAt != null) {
      const recovered = await this.recoverCompletedExchange(
        attempt,
        request,
        configuration,
        now,
      );
      if (recovered == null) {
        throw new GoneException('Android QR login is invalid or expired');
      }
      await this.auditSuccessfulExchange(recovered, metadata);
      return { session: recovered, status: 'complete' };
    }
    await this.auditExpiryIfNeeded(attempt, now, metadata);
    rejectTerminalClientAttempt(attempt, now);

    if (attempt.approvedAt == null) {
      const pollReserved =
        await this.prismaService.androidLoginAttempt.updateMany({
          data: { lastPolledAt: now },
          where: {
            OR: [
              { lastPolledAt: null },
              {
                lastPolledAt: {
                  lte: new Date(now.getTime() - MINIMUM_POLL_INTERVAL_MS),
                },
              },
            ],
            consumedAt: null,
            deniedAt: null,
            expiresAt: { gt: now },
            id: attempt.id,
          },
        });
      if (pollReserved.count !== 1) {
        return {
          retryAfterSeconds: MINIMUM_POLL_INTERVAL_MS / 1000,
          status: 'slow_down',
        };
      }

      attempt = await this.findAttemptForClient(
        request.attemptId,
        request.qrSecret,
      );
      if (attempt.approvedAt == null) {
        return {
          retryAfterSeconds: MINIMUM_POLL_INTERVAL_MS / 1000,
          status: 'pending',
        };
      }
    }

    const refreshToken = deriveSecret(
      configuration.secret,
      'android-qr-refresh-token',
      request.attemptId,
      request.qrSecret,
      request.verifier,
    );
    const sessionId = randomUUID();
    try {
      const result = await this.prismaService.$transaction(
        async (transaction) => {
          const authorizingSession = await transaction.session.findFirst({
            select: { id: true },
            where: {
              expiresAt: { gt: now },
              id: attempt.authorizingSessionId,
              revokedAt: null,
              userId: attempt.userId,
            },
          });
          if (authorizingSession == null) {
            throw new GoneException('Android QR login is invalid or expired');
          }

          const session = await transaction.session.create({
            data: {
              expiresAt: new Date(now.getTime() + SESSION_DURATION_MS),
              id: sessionId,
              ipAddress: metadata.ipAddress,
              lastUsedAt: now,
              refreshTokenHash: hashValue(refreshToken),
              userAgent: metadata.userAgent,
              userId: attempt.userId,
            },
            select: {
              createdAt: true,
              expiresAt: true,
              id: true,
              lastUsedAt: true,
            },
          });
          const consumed = await transaction.androidLoginAttempt.updateMany({
            data: {
              consumedAt: now,
              exchangeSessionId: sessionId,
              expiresAt: new Date(
                now.getTime() + EXCHANGE_RECOVERY_LIFETIME_MS,
              ),
            },
            where: {
              approvedAt: { not: null },
              authorizingSessionId: attempt.authorizingSessionId,
              consumedAt: null,
              deniedAt: null,
              expiresAt: { gt: now },
              id: attempt.id,
              userId: attempt.userId,
              verifierChallenge: createVerifierChallenge(request.verifier),
            },
          });
          if (consumed.count !== 1) {
            throw new GoneException('Android QR login is invalid or expired');
          }
          return { session, user: attempt.user };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      const response = this.issueSessionResponse(
        result.session,
        result.user,
        refreshToken,
        now,
      );
      await this.auditSuccessfulExchange(response, metadata);
      return { session: response, status: 'complete' };
    } catch (error) {
      const recovered = await this.recoverExchange(request, configuration, now);
      if (recovered != null) {
        await this.auditSuccessfulExchange(recovered, metadata);
        return { session: recovered, status: 'complete' };
      }
      await this.safeAuditLog({
        ...metadata,
        authMethod: 'android_qr',
        event: 'android_qr_exchange',
        failureReason: 'exchange_failed',
        outcome: 'failure',
        sessionId: attempt.authorizingSessionId,
        userId: attempt.userId,
      });
      throw error;
    }
  }

  private async pruneExpiredAttempts(now: Date): Promise<void> {
    const expiredAttempts =
      await this.prismaService.androidLoginAttempt.findMany({
        orderBy: { expiresAt: 'asc' },
        select: { id: true },
        take: MAX_PRUNED_ATTEMPTS,
        where: { expiresAt: { lte: now } },
      });
    if (expiredAttempts.length === 0) return;
    await this.prismaService.androidLoginAttempt.deleteMany({
      where: { id: { in: expiredAttempts.map(({ id }) => id) } },
    });
  }

  private async findOwnedAttempt(
    userId: string,
    authorizingSessionId: string,
    attemptId: string,
  ): Promise<AttemptRecord> {
    const attempt = await this.prismaService.androidLoginAttempt.findFirst({
      select: attemptSelect,
      where: { authorizingSessionId, id: attemptId, userId },
    });
    if (attempt == null) {
      throw new NotFoundException('Android QR login not found');
    }
    return attempt;
  }

  private async findAttemptForClient(
    attemptId: string,
    qrSecret: string,
  ): Promise<AttemptRecord> {
    const attempt = await this.prismaService.androidLoginAttempt.findUnique({
      select: attemptSelect,
      where: { id: attemptId },
    });
    if (attempt == null || !secureHashMatches(attempt.qrSecretHash, qrSecret)) {
      throw new GoneException('Android QR login is invalid or expired');
    }
    return attempt;
  }

  private async recoverExchange(
    request: ExchangeRequest,
    configuration: AndroidLoginConfiguration,
    now: Date,
  ): Promise<SessionResponse | null> {
    const attempt = await this.prismaService.androidLoginAttempt.findUnique({
      select: attemptSelect,
      where: { id: request.attemptId },
    });
    if (
      attempt == null ||
      !secureHashMatches(attempt.qrSecretHash, request.qrSecret)
    ) {
      return null;
    }
    return this.recoverCompletedExchange(attempt, request, configuration, now);
  }

  private async recoverCompletedExchange(
    attempt: AttemptRecord,
    request: ExchangeRequest,
    configuration: AndroidLoginConfiguration,
    now: Date,
  ): Promise<SessionResponse | null> {
    if (
      attempt.consumedAt == null ||
      attempt.exchangeSessionId == null ||
      attempt.expiresAt <= now ||
      !secureHashMatches(attempt.qrSecretHash, request.qrSecret) ||
      attempt.verifierChallenge !== createVerifierChallenge(request.verifier)
    ) {
      return null;
    }
    const session = await this.prismaService.session.findUnique({
      select: {
        createdAt: true,
        expiresAt: true,
        id: true,
        lastUsedAt: true,
        refreshTokenHash: true,
        revokedAt: true,
        rotatedRefreshTokenEncrypted: true,
        user: { select: { id: true, username: true } },
      },
      where: { id: attempt.exchangeSessionId },
    });
    if (
      session == null ||
      session.revokedAt != null ||
      session.expiresAt <= now
    ) {
      return null;
    }
    let refreshToken = deriveSecret(
      configuration.secret,
      'android-qr-refresh-token',
      request.attemptId,
      request.qrSecret,
      request.verifier,
    );
    if (!secureHashMatches(session.refreshTokenHash, refreshToken)) {
      if (session.rotatedRefreshTokenEncrypted == null) {
        return null;
      }
      try {
        refreshToken = this.totpService.decryptSecret(
          session.rotatedRefreshTokenEncrypted,
        );
      } catch {
        return null;
      }
      if (!secureHashMatches(session.refreshTokenHash, refreshToken)) {
        return null;
      }
    }
    return this.issueSessionResponse(session, session.user, refreshToken, now);
  }

  private issueSessionResponse(
    session: {
      createdAt: Date;
      expiresAt: Date;
      id: string;
      lastUsedAt: Date;
    },
    user: { id: string; username: string },
    refreshToken: string,
    issuedAt: Date,
  ): SessionResponse {
    const accessToken = this.accessTokenService.issueToken(
      { sessionId: session.id, userId: user.id },
      issuedAt,
    );
    return {
      accessToken: accessToken.token,
      accessTokenExpiresAt: accessToken.expiresAt,
      authMethod: 'android_qr',
      refreshToken,
      session,
      user,
    };
  }

  private async auditExpiryIfNeeded(
    attempt: AttemptRecord,
    now: Date,
    metadata: AuthAuditMetadata,
  ): Promise<void> {
    if (attempt.expiresAt > now) return;
    await this.safeAuditLog({
      ...metadata,
      authMethod: 'android_qr',
      event: 'android_qr_expire',
      failureReason: 'attempt_expired',
      outcome: 'failure',
      sessionId: attempt.authorizingSessionId,
      userId: attempt.userId,
      username: attempt.user.username,
    });
  }

  private async auditSuccessfulExchange(
    response: SessionResponse,
    metadata: AuthAuditMetadata,
  ): Promise<void> {
    await this.safeAuditLog({
      ...metadata,
      authMethod: 'android_qr',
      event: 'android_qr_exchange',
      outcome: 'success',
      sessionId: response.session.id,
      userId: response.user.id,
      username: response.user.username,
    });
  }

  private requireCreationConfiguration(): AndroidLoginConfiguration {
    if (!this.isCreationEnabled()) {
      throw new ServiceUnavailableException(
        'New Android QR login attempts are disabled',
      );
    }
    return this.requireConfiguration();
  }

  private requireConfiguration(): AndroidLoginConfiguration {
    const configuration = this.getConfiguration(true);
    if (configuration == null) {
      throw new ServiceUnavailableException('Android QR login is disabled');
    }
    return configuration;
  }

  private isCreationEnabled(): boolean {
    const configured = this.configService
      .get('AUTH_ANDROID_QR_LOGIN_CREATION_ENABLED')
      ?.trim()
      .toLowerCase();
    if (configured == null || configured === '' || configured === 'true') {
      return true;
    }
    if (configured === 'false') {
      return false;
    }
    throw new InternalServerErrorException(
      'AUTH_ANDROID_QR_LOGIN_CREATION_ENABLED must be true or false',
    );
  }

  private getConfiguration(
    rejectPartial: boolean,
  ): AndroidLoginConfiguration | null {
    const publicUrl = this.configService.get('KESTREL_PUBLIC_URL')?.trim();
    const configuredSecret = this.configService
      .get('AUTH_ANDROID_QR_LOGIN_SECRET')
      ?.trim();
    const configuredCount = [publicUrl, configuredSecret].filter(
      (value) => value != null && value !== '',
    ).length;
    if (configuredCount === 0) {
      return null;
    }
    if (configuredCount !== 2) {
      if (rejectPartial) {
        throw new InternalServerErrorException(
          'Android QR login configuration is incomplete',
        );
      }
      return null;
    }
    return {
      publicUrl: validatePublicUrl(publicUrl!),
      secret: decodeSecret(configuredSecret!),
    };
  }

  private async safeAuditLog(
    entry: Parameters<AuthAuditService['log']>[0],
  ): Promise<void> {
    try {
      await this.authAuditService.log(entry);
    } catch (error) {
      this.logger.warn(
        { err: error, event: entry.event },
        'failed to persist Android QR auth audit log',
      );
    }
  }
}

type AndroidLoginConfiguration = {
  publicUrl: string;
  secret: Buffer;
};

type ExchangeRequest = {
  attemptId: string;
  qrSecret: string;
  verifier: string;
};

function parseClaimRequest(input: unknown): {
  appVersion: string | null;
  attemptId: string;
  deviceName: string;
  qrSecret: string;
  verifierChallenge: string;
} {
  const record = parseRecord(input);
  return {
    appVersion: validateOptionalLabel(record.appVersion, 64, 'appVersion'),
    attemptId: validateAttemptId(record.attemptId),
    deviceName: validateRequiredLabel(record.deviceName, 128, 'deviceName'),
    qrSecret: validateQrSecret(record.qrSecret),
    verifierChallenge: validateVerifierChallenge(record.verifierChallenge),
  };
}

function parseExchangeRequest(input: unknown): ExchangeRequest {
  const record = parseRecord(input);
  return {
    attemptId: validateAttemptId(record.attemptId),
    qrSecret: validateQrSecret(record.qrSecret),
    verifier: validateVerifier(record.verifier),
  };
}

function parseRecord(input: unknown): Record<string, unknown> {
  if (input == null || typeof input !== 'object' || Array.isArray(input)) {
    throw new BadRequestException('request body must be an object');
  }
  return input as Record<string, unknown>;
}

function validateAttemptId(value: unknown): string {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw new BadRequestException('attemptId is invalid');
  }
  return value;
}

function validateQrSecret(value: unknown): string {
  if (typeof value !== 'string' || !BASE64URL_SECRET_PATTERN.test(value)) {
    throw new BadRequestException('qrSecret is invalid');
  }
  return value;
}

function validateVerifier(value: unknown): string {
  if (typeof value !== 'string' || !BASE64URL_VERIFIER_PATTERN.test(value)) {
    throw new BadRequestException('verifier is invalid');
  }
  return value;
}

function validateVerifierChallenge(value: unknown): string {
  if (typeof value !== 'string' || !BASE64URL_SECRET_PATTERN.test(value)) {
    throw new BadRequestException('verifierChallenge is invalid');
  }
  return value;
}

function validateRequiredLabel(
  value: unknown,
  maxLength: number,
  label: string,
): string {
  const normalized = normalizeLabel(value, maxLength);
  if (normalized == null) {
    throw new BadRequestException(`${label} is invalid`);
  }
  return normalized;
}

function validateOptionalLabel(
  value: unknown,
  maxLength: number,
  label: string,
): string | null {
  if (value == null) {
    return null;
  }
  const normalized = normalizeLabel(value, maxLength);
  if (normalized == null) {
    throw new BadRequestException(`${label} is invalid`);
  }
  return normalized;
}

function normalizeLabel(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.replace(/[\p{Cc}\p{Cf}]/gu, ' ').trim();
  return normalized.length === 0 || normalized.length > maxLength
    ? null
    : normalized;
}

function rejectUnavailableWebTransition(
  attempt: AttemptRecord,
  now: Date,
  requiredState: 'claim',
): never {
  if (attempt.consumedAt != null) {
    throw new ConflictException('Android QR login is already complete');
  }
  if (
    attempt.deniedAt != null ||
    attempt.expiresAt <= now ||
    attempt.authorizingSession.revokedAt != null ||
    attempt.authorizingSession.expiresAt <= now
  ) {
    throw new GoneException('Android QR login is invalid or expired');
  }
  if (requiredState === 'claim' && attempt.claimedAt == null) {
    throw new ConflictException('Android QR login has not been claimed');
  }
  throw new ConflictException('Android QR login cannot be updated');
}

function rejectTerminalClientAttempt(attempt: AttemptRecord, now: Date): void {
  if (attempt.deniedAt != null) {
    throw new ForbiddenException('Android QR login was denied');
  }
  if (
    attempt.expiresAt <= now ||
    attempt.authorizingSession.revokedAt != null ||
    attempt.authorizingSession.expiresAt <= now
  ) {
    throw new GoneException('Android QR login is invalid or expired');
  }
}

function verifyClientBinding(attempt: AttemptRecord, verifier: string): void {
  if (
    attempt.verifierChallenge == null ||
    attempt.verifierChallenge !== createVerifierChallenge(verifier)
  ) {
    throw new GoneException('Android QR login is invalid or expired');
  }
}

function toWebAttempt(
  attempt: AttemptRecord,
  now: Date,
  configuration: AndroidLoginConfiguration | null,
) {
  const status = getAttemptStatus(attempt, now);
  const matchingCode =
    attempt.verifierChallenge == null || configuration == null
      ? null
      : createMatchingCode(
          configuration.secret,
          attempt.id,
          attempt.verifierChallenge,
        );
  return {
    attemptId: attempt.id,
    device:
      attempt.claimedAt == null
        ? null
        : {
            appVersion: attempt.appVersion,
            name: attempt.deviceName,
          },
    expiresAt: attempt.expiresAt,
    matchingCode,
    status,
  };
}

function getAttemptStatus(
  attempt: AttemptRecord,
  now: Date,
): 'approved' | 'claimed' | 'consumed' | 'denied' | 'expired' | 'pending' {
  if (attempt.consumedAt != null) return 'consumed';
  if (attempt.deniedAt != null) return 'denied';
  if (attempt.expiresAt <= now) return 'expired';
  if (attempt.approvedAt != null) return 'approved';
  if (attempt.claimedAt != null) return 'claimed';
  return 'pending';
}

function createQrPayload(
  publicUrl: string,
  attemptId: string,
  qrSecret: string,
): string {
  const url = new URL(ANDROID_LOGIN_PATH, publicUrl);
  url.hash = new URLSearchParams({
    attempt: attemptId,
    secret: qrSecret,
    v: '1',
  }).toString();
  return url.toString();
}

function createRandomSecret(): string {
  return randomBytes(SECRET_BYTES).toString('base64url');
}

function hashValue(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function secureHashMatches(expectedHash: string, value: string): boolean {
  const expected = Buffer.from(expectedHash, 'hex');
  const actual = Buffer.from(hashValue(value), 'hex');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function createVerifierChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

function deriveSecret(
  key: Buffer,
  context: string,
  ...values: string[]
): string {
  const hmac = createHmac('sha256', key).update(context);
  for (const value of values) {
    hmac.update('\0').update(value);
  }
  return hmac.digest('base64url');
}

function createMatchingCode(
  key: Buffer,
  attemptId: string,
  verifierChallenge: string,
): string {
  const digest = createHmac('sha256', key)
    .update('android-qr-matching-code')
    .update('\0')
    .update(attemptId)
    .update('\0')
    .update(verifierChallenge)
    .digest();
  const code = (digest.readUInt32BE(0) % 1_000_000).toString().padStart(6, '0');
  return `${code.slice(0, 3)}-${code.slice(3)}`;
}

function validatePublicUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new InternalServerErrorException('Kestrel public URL is invalid');
  }
  if (
    url.username !== '' ||
    url.password !== '' ||
    url.pathname !== '/' ||
    url.search !== '' ||
    url.hash !== ''
  ) {
    throw new InternalServerErrorException(
      'Kestrel public URL must contain only an origin',
    );
  }
  const isLoopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (
    url.protocol !== 'https:' &&
    !(
      process.env.NODE_ENV !== 'production' &&
      url.protocol === 'http:' &&
      isLoopback
    )
  ) {
    throw new InternalServerErrorException(
      'Kestrel public URL must use HTTPS or development loopback HTTP',
    );
  }
  return url.origin;
}

function decodeSecret(value: string): Buffer {
  const secret = /^[0-9a-fA-F]{64}$/.test(value)
    ? Buffer.from(value, 'hex')
    : Buffer.from(value, 'base64');
  if (secret.length !== ENCRYPTION_KEY_BYTES) {
    throw new InternalServerErrorException(
      'AUTH_ANDROID_QR_LOGIN_SECRET must contain exactly 32 bytes',
    );
  }
  return secret;
}
