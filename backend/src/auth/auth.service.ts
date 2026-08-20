import {
  BadRequestException,
  ConflictException,
  HttpException,
  InternalServerErrorException,
  UnauthorizedException,
} from '../http/errors';
import { createLogger } from '../logger';
import { Prisma } from '@prisma/client';
import { argon2id, hash, verify } from 'argon2';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AccessTokenService } from './access-token.service';
import { AuthAuditMetadata, AuthAuditService } from './auth-audit.service';
import {
  AUTH_RATE_LIMIT_TYPE,
  AuthRateLimitService,
} from './auth-rate-limit.service';
import { SessionRevocationService } from './session-revocation.service';
import { TotpService } from './totp.service';

const refreshSessionSelect = Prisma.validator<Prisma.SessionSelect>()({
  createdAt: true,
  expiresAt: true,
  id: true,
  ipAddress: true,
  refreshRequestId: true,
  refreshTokenHash: true,
  refreshTokenRotatedAt: true,
  revokedAt: true,
  rotatedRefreshTokenEncrypted: true,
  userAgent: true,
  user: {
    select: {
      username: true,
    },
  },
  userId: true,
});

type RefreshSessionRecord = Prisma.SessionGetPayload<{
  select: typeof refreshSessionSelect;
}>;

export class AuthService {
  private readonly logger = createLogger(AuthService.name);

  constructor(
    private readonly accessTokenService: AccessTokenService,
    private readonly authAuditService: AuthAuditService,
    private readonly authRateLimitService: AuthRateLimitService,
    private readonly prismaService: PrismaService,
    private readonly sessionRevocationService: SessionRevocationService,
    private readonly totpService: TotpService,
  ) {}

  async register(input: unknown) {
    const { password, username } = parseRegisterRequest(input);
    const normalizedUsername = normalizeUsername(username);
    const normalizedPassword = validatePassword(password);

    const existingUser = await this.prismaService.user.findUnique({
      where: { username: normalizedUsername },
      select: { id: true },
    });

    if (existingUser != null) {
      throw new ConflictException('username already exists');
    }

    const passwordHash = await hash(normalizedPassword, {
      type: argon2id,
    });

    try {
      const user = await this.prismaService.user.create({
        data: {
          passwordHash,
          username: normalizedUsername,
        },
        select: {
          createdAt: true,
          id: true,
          username: true,
        },
      });

      return {
        nextStep: 'login' as const,
        user,
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('username already exists');
      }

      throw error;
    }
  }

  async setupTotp(input: unknown) {
    const { password, username } = parseUsernamePasswordRequest(input);
    const user = await this.authenticateUser(username, password);

    if (user.totpEnabledAt != null) {
      throw new ConflictException('totp already enabled');
    }

    const setup = await this.totpService.createSetup(user.username);

    await this.prismaService.user.update({
      data: {
        totpEnabledAt: null,
        totpSecretEncrypted: setup.encryptedSecret,
      },
      select: {
        id: true,
        username: true,
      },
      where: {
        id: user.id,
      },
    });

    return {
      otpauthUrl: setup.otpauthUrl,
      qrCodeDataUrl: setup.qrCodeDataUrl,
      secret: setup.secret,
      user: {
        id: user.id,
        username: user.username,
      },
    };
  }

  async verifyTotp(input: unknown) {
    const { code, password, username } = parseTotpVerifyRequest(input);
    const user = await this.authenticateUser(username, password);

    if (user.totpEnabledAt != null) {
      throw new ConflictException('totp already enabled');
    }

    if (user.totpSecretEncrypted == null) {
      throw new BadRequestException('totp setup has not been started');
    }

    const secret = this.totpService.decryptSecret(user.totpSecretEncrypted);
    await this.authRateLimitService.assertAllowed(
      AUTH_RATE_LIMIT_TYPE.TOTP,
      user.username,
    );

    if (!this.totpService.verifyCode(secret, code)) {
      await this.authRateLimitService.recordFailure(
        AUTH_RATE_LIMIT_TYPE.TOTP,
        user.username,
      );
      throw new BadRequestException('invalid totp code');
    }
    await this.authRateLimitService.reset(
      AUTH_RATE_LIMIT_TYPE.TOTP,
      user.username,
    );

    const totpEnabledAt = new Date();
    const { recoveryCodes, updatedUser } =
      await this.prismaService.$transaction(async (transaction) => {
        const recoveryCodes = await createRecoveryCodes();

        await transaction.recoveryCode.deleteMany({
          where: {
            userId: user.id,
          },
        });
        await transaction.recoveryCode.createMany({
          data: recoveryCodes.codeHashes.map((codeHash) => ({
            codeHash,
            userId: user.id,
          })),
        });
        const updatedUser = await transaction.user.update({
          data: {
            totpEnabledAt,
          },
          select: {
            id: true,
            totpEnabledAt: true,
            username: true,
          },
          where: {
            id: user.id,
          },
        });

        return {
          recoveryCodes,
          updatedUser,
        };
      });

    return {
      nextStep: 'login' as const,
      recoveryCodes: recoveryCodes.codes,
      user: updatedUser,
    };
  }

  async login(input: unknown, metadata: AuthAuditMetadata = {}) {
    const devDefaultLogin = isDevDefaultLoginInput(input);
    const loginRequest = parseLoginRequest(input, {
      allowWeakPassword: devDefaultLogin,
    });
    const authMethod = getLoginAuthMethod(loginRequest);
    let userId: string | undefined;

    try {
      if (devDefaultLogin) {
        await this.ensureDevDefaultUser();
      }

      const user = await this.authenticateUser(
        loginRequest.username,
        loginRequest.password,
      );
      userId = user.id;

      if (
        user.totpEnabledAt != null &&
        loginRequest.totpCode == null &&
        loginRequest.recoveryCode == null
      ) {
        throw new UnauthorizedException('one-time code required');
      }

      const authenticatedAt = new Date();
      const refreshToken = createRefreshToken();
      const refreshTokenHash = hashRefreshToken(refreshToken);
      const session = await this.prismaService.$transaction(
        async (transaction) => {
          if (loginRequest.totpCode != null) {
            if (
              user.totpEnabledAt == null ||
              user.totpSecretEncrypted == null
            ) {
              throw new UnauthorizedException('totp is not enabled');
            }
            await this.validateTotpCode(
              user.username,
              user.totpSecretEncrypted,
              loginRequest.totpCode,
            );
          } else if (loginRequest.recoveryCode != null) {
            await this.validateRecoveryCode(
              transaction,
              user.id,
              user.username,
              loginRequest.recoveryCode,
              authenticatedAt,
            );
          }

          return transaction.session.create({
            data: {
              expiresAt: createSessionExpiry(authenticatedAt),
              ipAddress: metadata.ipAddress,
              lastUsedAt: authenticatedAt,
              refreshTokenHash,
              userAgent: metadata.userAgent,
              userId: user.id,
            },
            select: {
              createdAt: true,
              expiresAt: true,
              id: true,
              lastUsedAt: true,
            },
          });
        },
      );
      const accessToken = this.accessTokenService.issueToken(
        {
          sessionId: session.id,
          userId: user.id,
        },
        authenticatedAt,
      );

      await this.safeAuditLog({
        ...metadata,
        authMethod,
        event: 'login',
        outcome: 'success',
        sessionId: session.id,
        userId: user.id,
        username: user.username,
      });

      return {
        accessToken: accessToken.token,
        accessTokenExpiresAt: accessToken.expiresAt,
        authMethod,
        refreshToken,
        session,
        user: {
          id: user.id,
          username: user.username,
        },
      };
    } catch (error) {
      await this.safeAuditLog({
        ...metadata,
        authMethod:
          error instanceof UnauthorizedException &&
          error.message === 'invalid username or password'
            ? 'password'
            : authMethod,
        event: 'login',
        failureReason: getAuditFailureReason(error),
        outcome: 'failure',
        userId,
        username: loginRequest.username,
      });

      throw error;
    }
  }

  async refresh(input: unknown, metadata: AuthAuditMetadata = {}) {
    const { refreshRequestId, refreshToken } = parseRefreshRequest(input);
    const now = new Date();
    const refreshTokenHash = hashRefreshToken(refreshToken);
    const session = await this.prismaService.session.findUnique({
      select: refreshSessionSelect,
      where: { refreshTokenHash },
    });

    if (session == null) {
      const recovered = await this.recoverRotatedRefresh(
        refreshTokenHash,
        refreshRequestId,
        now,
        metadata,
      );
      if (recovered != null) {
        return recovered;
      }

      await this.rejectConsumedRefreshTokenReplay(
        refreshTokenHash,
        now,
        metadata,
      );
      await this.safeAuditLog({
        ...metadata,
        authMethod: 'refresh_token',
        event: 'refresh',
        failureReason: 'invalid_refresh_token',
        outcome: 'failure',
      });
      throw new UnauthorizedException('invalid refresh token');
    }

    await this.assertRefreshSessionActive(session, now, metadata);

    const nextRefreshToken = createRefreshToken();
    const rotation = await this.prismaService.$transaction(async (tx) => {
      const updated = await tx.session.updateMany({
        data: {
          ipAddress: metadata.ipAddress,
          lastUsedAt: now,
          previousRefreshTokenHash: refreshTokenHash,
          refreshRequestId: refreshRequestId ?? null,
          refreshTokenHash: hashRefreshToken(nextRefreshToken),
          refreshTokenRotatedAt: now,
          rotatedRefreshTokenEncrypted:
            this.totpService.encryptSecret(nextRefreshToken),
          userAgent: metadata.userAgent,
        },
        where: {
          expiresAt: { gt: now },
          id: session.id,
          refreshTokenHash,
          revokedAt: null,
        },
      });
      if (updated.count === 1) {
        await tx.refreshTokenHistory.create({
          data: {
            consumedAt: now,
            expiresAt: session.expiresAt,
            sessionId: session.id,
            tokenHash: refreshTokenHash,
          },
        });
      }
      return updated;
    });

    if (rotation.count !== 1) {
      const recovered = await this.recoverRotatedRefresh(
        refreshTokenHash,
        refreshRequestId,
        now,
        metadata,
      );
      if (recovered != null) {
        return recovered;
      }

      await this.rejectConsumedRefreshTokenReplay(
        refreshTokenHash,
        now,
        metadata,
      );

      const latestSession = await this.prismaService.session.findUnique({
        select: refreshSessionSelect,
        where: { id: session.id },
      });
      if (latestSession != null) {
        await this.assertRefreshSessionActive(latestSession, now, metadata);
      }

      await this.safeAuditLog({
        ...metadata,
        authMethod: 'refresh_token',
        event: 'refresh',
        failureReason: 'refresh_token_rotation_conflict',
        outcome: 'failure',
        sessionId: session.id,
        userId: session.userId,
        username: session.user.username,
      });
      throw new UnauthorizedException('invalid refresh token');
    }

    void this.prismaService.refreshTokenHistory
      .deleteMany({ where: { expiresAt: { lte: now } } })
      .catch((error: unknown) => {
        this.logger.warn(
          { err: error },
          'failed to prune expired refresh token history',
        );
      });

    return this.issueRefreshedSession(session, nextRefreshToken, now, metadata);
  }

  private async rejectConsumedRefreshTokenReplay(
    refreshTokenHash: string,
    now: Date,
    metadata: AuthAuditMetadata,
  ): Promise<void> {
    const consumedToken =
      await this.prismaService.refreshTokenHistory.findUnique({
        select: {
          session: {
            select: {
              user: { select: { username: true } },
              userId: true,
            },
          },
          sessionId: true,
        },
        where: { tokenHash: refreshTokenHash },
      });
    if (consumedToken == null) {
      return;
    }

    await this.sessionRevocationService.revokeSessions(
      consumedToken.session.userId,
      [consumedToken.sessionId],
      now,
    );
    await this.safeAuditLog({
      ...metadata,
      authMethod: 'refresh_token',
      event: 'refresh',
      failureReason: 'refresh_token_reuse_detected',
      outcome: 'failure',
      sessionId: consumedToken.sessionId,
      userId: consumedToken.session.userId,
      username: consumedToken.session.user.username,
    });
    throw new UnauthorizedException('invalid refresh token');
  }

  private async recoverRotatedRefresh(
    previousRefreshTokenHash: string,
    refreshRequestId: string | undefined,
    now: Date,
    metadata: AuthAuditMetadata,
  ) {
    const session = await this.prismaService.session.findUnique({
      select: refreshSessionSelect,
      where: { previousRefreshTokenHash },
    });
    if (session == null) {
      return null;
    }

    await this.assertRefreshSessionActive(session, now, metadata);
    const rotatedAt = session.refreshTokenRotatedAt;
    const encryptedToken = session.rotatedRefreshTokenEncrypted;
    const metadataMatches =
      session.ipAddress === (metadata.ipAddress ?? null) &&
      session.userAgent === (metadata.userAgent ?? null);
    const requestMatches =
      session.refreshRequestId == null
        ? metadataMatches
        : session.refreshRequestId === refreshRequestId;
    if (
      !requestMatches ||
      rotatedAt == null ||
      encryptedToken == null ||
      now.getTime() - rotatedAt.getTime() > REFRESH_RETRY_WINDOW_MS
    ) {
      await this.sessionRevocationService.revokeSessions(
        session.userId,
        [session.id],
        now,
      );
      await this.safeAuditLog({
        ...metadata,
        authMethod: 'refresh_token',
        event: 'refresh',
        failureReason: 'refresh_token_reuse_detected',
        outcome: 'failure',
        sessionId: session.id,
        userId: session.userId,
        username: session.user.username,
      });
      throw new UnauthorizedException('invalid refresh token');
    }

    const touch = await this.prismaService.session.updateMany({
      data: {
        ipAddress: metadata.ipAddress,
        lastUsedAt: now,
        userAgent: metadata.userAgent,
      },
      where: {
        expiresAt: { gt: now },
        id: session.id,
        previousRefreshTokenHash,
        refreshRequestId: session.refreshRequestId,
        refreshTokenHash: session.refreshTokenHash,
        refreshTokenRotatedAt: rotatedAt,
        revokedAt: null,
      },
    });
    if (touch.count !== 1) {
      const latestSession = await this.prismaService.session.findUnique({
        select: refreshSessionSelect,
        where: { id: session.id },
      });
      if (latestSession != null) {
        await this.assertRefreshSessionActive(latestSession, now, metadata);
      }
      await this.safeAuditLog({
        ...metadata,
        authMethod: 'refresh_token',
        event: 'refresh',
        failureReason: 'refresh_retry_superseded',
        outcome: 'failure',
        sessionId: session.id,
        userId: session.userId,
        username: session.user.username,
      });
      throw new UnauthorizedException('refresh retry was superseded');
    }

    return this.issueRefreshedSession(
      session,
      this.totpService.decryptSecret(encryptedToken),
      now,
      metadata,
    );
  }

  private async assertRefreshSessionActive(
    session: RefreshSessionRecord,
    now: Date,
    metadata: AuthAuditMetadata,
  ): Promise<void> {
    if (
      session.revokedAt == null &&
      session.expiresAt.getTime() > now.getTime()
    ) {
      return;
    }

    await this.safeAuditLog({
      ...metadata,
      authMethod: 'refresh_token',
      event: 'refresh',
      failureReason:
        session.revokedAt != null ? 'session_revoked' : 'session_expired',
      outcome: 'failure',
      sessionId: session.id,
      userId: session.userId,
      username: session.user.username,
    });
    throw new UnauthorizedException('session is no longer active');
  }

  private async issueRefreshedSession(
    session: RefreshSessionRecord,
    refreshToken: string,
    now: Date,
    metadata: AuthAuditMetadata,
  ) {
    const accessToken = this.accessTokenService.issueToken(
      {
        sessionId: session.id,
        userId: session.userId,
      },
      now,
    );

    await this.safeAuditLog({
      ...metadata,
      authMethod: 'refresh_token',
      event: 'refresh',
      outcome: 'success',
      sessionId: session.id,
      userId: session.userId,
      username: session.user.username,
    });

    return {
      accessToken: accessToken.token,
      accessTokenExpiresAt: accessToken.expiresAt,
      refreshToken,
      session: {
        createdAt: session.createdAt,
        expiresAt: session.expiresAt,
        id: session.id,
        lastUsedAt: now,
      },
      user: {
        id: session.userId,
        username: session.user.username,
      },
    };
  }

  async confirmCurrentPassword(
    userId: string,
    currentPassword: string,
  ): Promise<void> {
    const user = await this.prismaService.user.findUnique({
      select: { id: true, username: true },
      where: { id: userId },
    });

    if (user == null) {
      throw new UnauthorizedException('missing authenticated user');
    }

    await this.authenticateUser(user.username, currentPassword);
  }

  async changePassword(
    userId: string,
    input: unknown,
    metadata: AuthAuditMetadata = {},
  ) {
    const { currentPassword, newPassword } = parseChangePasswordRequest(input);
    const user = await this.prismaService.user.findUnique({
      select: {
        id: true,
        passwordHash: true,
        username: true,
      },
      where: { id: userId },
    });

    if (user == null) {
      throw new UnauthorizedException('missing authenticated user');
    }

    await this.authRateLimitService.assertAllowed(
      AUTH_RATE_LIMIT_TYPE.PASSWORD,
      user.username,
    );

    if (!(await verify(user.passwordHash, currentPassword))) {
      await this.authRateLimitService.recordFailure(
        AUTH_RATE_LIMIT_TYPE.PASSWORD,
        user.username,
      );
      await this.safeAuditLog({
        ...metadata,
        authMethod: 'password',
        event: 'password_change',
        failureReason: 'invalid_current_password',
        outcome: 'failure',
        userId: user.id,
        username: user.username,
      });
      throw new UnauthorizedException('invalid current password');
    }

    await this.authRateLimitService.reset(
      AUTH_RATE_LIMIT_TYPE.PASSWORD,
      user.username,
    );
    await this.prismaService.user.update({
      data: {
        passwordHash: await hash(newPassword, {
          type: argon2id,
        }),
      },
      select: {
        id: true,
      },
      where: {
        id: user.id,
      },
    });
    await this.safeAuditLog({
      ...metadata,
      authMethod: 'password',
      event: 'password_change',
      outcome: 'success',
      userId: user.id,
      username: user.username,
    });

    return { ok: true as const };
  }

  async revokeSession(accessToken: string, metadata: AuthAuditMetadata = {}) {
    const tokenClaims = this.accessTokenService.verifyToken(accessToken);
    const session = await this.prismaService.session.findUnique({
      select: {
        id: true,
        revokedAt: true,
        user: {
          select: {
            username: true,
          },
        },
        userId: true,
      },
      where: {
        id: tokenClaims.sessionId,
      },
    });

    if (session == null || session.userId !== tokenClaims.userId) {
      await this.safeAuditLog({
        ...metadata,
        authMethod: 'access_token',
        event: 'session_revoke',
        failureReason: 'invalid_session',
        outcome: 'failure',
        sessionId: tokenClaims.sessionId,
        userId: tokenClaims.userId,
      });
      throw new UnauthorizedException('session is no longer active');
    }

    const revokedAt = session.revokedAt ?? new Date();
    if (session.revokedAt == null) {
      await this.sessionRevocationService.revokeSessions(
        session.userId,
        [session.id],
        revokedAt,
      );
    }
    const revokedSession = {
      id: session.id,
      revokedAt,
    };

    await this.safeAuditLog({
      ...metadata,
      authMethod: 'access_token',
      event: 'session_revoke',
      outcome: 'success',
      sessionId: session.id,
      userId: session.userId,
      username: session.user.username,
    });

    return {
      session: revokedSession,
    };
  }

  private async authenticateUser(username: string, password: string) {
    await this.authRateLimitService.assertAllowed(
      AUTH_RATE_LIMIT_TYPE.PASSWORD,
      username,
    );
    const user = await this.prismaService.user.findUnique({
      select: {
        id: true,
        passwordHash: true,
        totpEnabledAt: true,
        totpSecretEncrypted: true,
        username: true,
      },
      where: { username },
    });

    if (user == null) {
      await this.authRateLimitService.recordFailure(
        AUTH_RATE_LIMIT_TYPE.PASSWORD,
        username,
      );
      throw new UnauthorizedException('invalid username or password');
    }

    const passwordMatches = await verify(user.passwordHash, password);

    if (!passwordMatches) {
      await this.authRateLimitService.recordFailure(
        AUTH_RATE_LIMIT_TYPE.PASSWORD,
        username,
      );
      throw new UnauthorizedException('invalid username or password');
    }
    await this.authRateLimitService.reset(
      AUTH_RATE_LIMIT_TYPE.PASSWORD,
      username,
    );

    return user;
  }

  private async ensureDevDefaultUser(): Promise<void> {
    if (!isDevDefaultLoginEnabled()) {
      return;
    }

    const passwordHash = await hash(DEV_DEFAULT_PASSWORD, {
      type: argon2id,
    });

    await this.prismaService.user.upsert({
      create: {
        passwordHash,
        username: DEV_DEFAULT_USERNAME,
      },
      select: {
        id: true,
      },
      update: {
        passwordHash,
        totpEnabledAt: null,
        totpSecretEncrypted: null,
      },
      where: {
        username: DEV_DEFAULT_USERNAME,
      },
    });
  }

  private async safeAuditLog(
    entry: Parameters<AuthAuditService['log']>[0],
  ): Promise<void> {
    try {
      await this.authAuditService.log(entry);
    } catch (error) {
      this.logger.warn(
        { err: error, event: entry.event },
        'failed to persist auth audit log',
      );
    }
  }

  private async validateRecoveryCode(
    transaction: Prisma.TransactionClient,
    userId: string,
    username: string,
    recoveryCode: string,
    authenticatedAt: Date,
  ) {
    await this.authRateLimitService.assertAllowed(
      AUTH_RATE_LIMIT_TYPE.RECOVERY_CODE,
      username,
    );
    const consumedRecoveryCode = await useRecoveryCode(
      transaction,
      userId,
      recoveryCode,
      authenticatedAt,
    );

    if (!consumedRecoveryCode) {
      await this.authRateLimitService.recordFailure(
        AUTH_RATE_LIMIT_TYPE.RECOVERY_CODE,
        username,
      );
      throw new UnauthorizedException('invalid one-time code');
    }

    await this.authRateLimitService.reset(
      AUTH_RATE_LIMIT_TYPE.RECOVERY_CODE,
      username,
    );
  }

  private async validateTotpCode(
    username: string,
    totpSecretEncrypted: string,
    code: string,
  ) {
    await this.authRateLimitService.assertAllowed(
      AUTH_RATE_LIMIT_TYPE.TOTP,
      username,
    );
    const secret = this.totpService.decryptSecret(totpSecretEncrypted);

    if (!this.totpService.verifyCode(secret, code)) {
      await this.authRateLimitService.recordFailure(
        AUTH_RATE_LIMIT_TYPE.TOTP,
        username,
      );
      throw new UnauthorizedException('invalid one-time code');
    }

    await this.authRateLimitService.reset(AUTH_RATE_LIMIT_TYPE.TOTP, username);
  }
}

const DEV_DEFAULT_PASSWORD = 'admin';
const DEV_DEFAULT_USERNAME = 'admin';
const MIN_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_LENGTH = 256;
const MIN_USERNAME_LENGTH = 3;
const MAX_USERNAME_LENGTH = 64;
const RECOVERY_CODE_COUNT = 10;
const RECOVERY_CODE_GROUP_LENGTH = 4;
const RECOVERY_CODE_GROUP_COUNT = 2;
const RECOVERY_CODE_ALPHABET_MASK = 31;
const RECOVERY_CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const RECOVERY_CODE_MAX_ATTEMPTS = 100;
const SESSION_DURATION_DAYS = 30;
const REFRESH_TOKEN_BYTES = 32;
const REFRESH_RETRY_WINDOW_MS = 20 * 60 * 1000;
const USERNAME_PATTERN = /^[A-Za-z0-9._-]+$/;

function parseRegisterRequest(input: unknown): {
  password: unknown;
  username: unknown;
} {
  const inputRecord = parseUnknownRecord(input);

  return {
    password: inputRecord.password,
    username: inputRecord.username,
  };
}

function parseUsernamePasswordRequest(input: unknown): {
  password: string;
  username: string;
} {
  const { password, username } = parseRegisterRequest(input);

  return {
    password: validatePassword(password),
    username: normalizeUsername(username),
  };
}

function parseTotpVerifyRequest(input: unknown): {
  code: string;
  password: string;
  username: string;
} {
  const inputRecord = parseUnknownRecord(input);

  if (typeof inputRecord.code !== 'string') {
    throw new BadRequestException('code must be a string');
  }

  return {
    code: inputRecord.code,
    password: validatePassword(inputRecord.password),
    username: normalizeUsername(inputRecord.username),
  };
}

function parseLoginRequest(
  input: unknown,
  options: { allowWeakPassword?: boolean } = {},
): {
  password: string;
  recoveryCode?: string;
  totpCode?: string;
  username: string;
} {
  const inputRecord = parseUnknownRecord(input);
  const totpCode = inputRecord.totpCode;
  const recoveryCode = inputRecord.recoveryCode;

  if (totpCode != null && typeof totpCode !== 'string') {
    throw new BadRequestException('totpCode must be a string');
  }

  if (recoveryCode != null && typeof recoveryCode !== 'string') {
    throw new BadRequestException('recoveryCode must be a string');
  }

  if (totpCode != null && recoveryCode != null) {
    throw new BadRequestException(
      'use either totpCode or recoveryCode, not both',
    );
  }

  return {
    password: validatePassword(inputRecord.password, options),
    ...(recoveryCode == null
      ? {}
      : { recoveryCode: normalizeRecoveryCode(recoveryCode) }),
    ...(totpCode == null || totpCode.trim() === '' ? {} : { totpCode }),
    username: normalizeUsername(inputRecord.username),
  };
}

function parseChangePasswordRequest(input: unknown): {
  currentPassword: string;
  newPassword: string;
} {
  const inputRecord = parseUnknownRecord(input);

  return {
    currentPassword: validatePassword(inputRecord.currentPassword),
    newPassword: validatePassword(inputRecord.newPassword),
  };
}

function getLoginAuthMethod(loginRequest: {
  recoveryCode?: string;
  totpCode?: string;
}): 'password' | 'recovery_code' | 'totp' {
  if (loginRequest.totpCode != null) {
    return 'totp';
  }

  if (loginRequest.recoveryCode != null) {
    return 'recovery_code';
  }

  return 'password';
}

function parseRefreshRequest(input: unknown): {
  refreshRequestId?: string;
  refreshToken: string;
} {
  const inputRecord = parseUnknownRecord(input);
  const refreshRequestId = inputRecord.refreshRequestId;

  if (typeof inputRecord.refreshToken !== 'string') {
    throw new BadRequestException('refreshToken must be a string');
  }
  if (
    refreshRequestId != null &&
    (typeof refreshRequestId !== 'string' ||
      refreshRequestId.length === 0 ||
      refreshRequestId.length > 128)
  ) {
    throw new BadRequestException('refreshRequestId is invalid');
  }

  return {
    ...(refreshRequestId == null ? {} : { refreshRequestId }),
    refreshToken: inputRecord.refreshToken,
  };
}

function parseUnknownRecord(input: unknown): Record<string, unknown> {
  if (input == null || typeof input !== 'object') {
    throw new BadRequestException('request body must be an object');
  }

  return input as Record<string, unknown>;
}

function normalizeUsername(username: unknown): string {
  if (typeof username !== 'string') {
    throw new BadRequestException('username must be a string');
  }

  const normalizedUsername = username.trim();

  if (
    normalizedUsername.length < MIN_USERNAME_LENGTH ||
    normalizedUsername.length > MAX_USERNAME_LENGTH
  ) {
    throw new BadRequestException(
      'username must be between 3 and 64 characters',
    );
  }

  if (!USERNAME_PATTERN.test(normalizedUsername)) {
    throw new BadRequestException(
      'username may only contain letters, numbers, dots, underscores, and hyphens',
    );
  }

  return normalizedUsername;
}

function validatePassword(
  password: unknown,
  options: { allowWeakPassword?: boolean } = {},
): string {
  if (typeof password !== 'string') {
    throw new BadRequestException('password must be a string');
  }

  if (options.allowWeakPassword === true) {
    if (password.length > MAX_PASSWORD_LENGTH) {
      throw new BadRequestException(
        'password must be between 1 and 256 characters',
      );
    }

    return password;
  }

  if (
    password.length < MIN_PASSWORD_LENGTH ||
    password.length > MAX_PASSWORD_LENGTH
  ) {
    throw new BadRequestException(
      'password must be between 12 and 256 characters',
    );
  }

  return password;
}

function isDevDefaultLoginInput(input: unknown): boolean {
  if (!isDevDefaultLoginEnabled()) {
    return false;
  }

  const inputRecord = parseUnknownRecord(input);

  return (
    inputRecord.username === DEV_DEFAULT_USERNAME &&
    inputRecord.password === DEV_DEFAULT_PASSWORD
  );
}

function isDevDefaultLoginEnabled(): boolean {
  return (
    process.env.AUTH_DEV_DEFAULT_LOGIN_ENABLED === 'true' &&
    process.env.NODE_ENV !== 'production'
  );
}

async function createRecoveryCodes(): Promise<{
  codeHashes: string[];
  codes: string[];
}> {
  const normalizedCodes = new Set<string>();
  let attempts = 0;

  while (
    normalizedCodes.size < RECOVERY_CODE_COUNT &&
    attempts < RECOVERY_CODE_MAX_ATTEMPTS
  ) {
    normalizedCodes.add(createRecoveryCodeValue());
    attempts += 1;
  }

  if (normalizedCodes.size < RECOVERY_CODE_COUNT) {
    throw new InternalServerErrorException('failed to generate recovery codes');
  }

  const codes = Array.from(normalizedCodes, formatRecoveryCode);
  const codeHashes = await Promise.all(
    Array.from(normalizedCodes, (code) =>
      hash(code, {
        type: argon2id,
      }),
    ),
  );

  return {
    codeHashes,
    codes,
  };
}

function createRecoveryCodeValue(): string {
  let value = '';

  for (const byte of randomBytes(
    RECOVERY_CODE_GROUP_LENGTH * RECOVERY_CODE_GROUP_COUNT,
  )) {
    // The alphabet has 32 symbols, so taking the low 5 bits is uniform.
    value += RECOVERY_CODE_ALPHABET[byte & RECOVERY_CODE_ALPHABET_MASK];
  }

  return value;
}

function formatRecoveryCode(code: string): string {
  return [
    code.slice(0, RECOVERY_CODE_GROUP_LENGTH),
    code.slice(RECOVERY_CODE_GROUP_LENGTH),
  ].join('-');
}

function normalizeRecoveryCode(code: string): string {
  const normalizedCode = code.toUpperCase().replaceAll(/\s|-/g, '');

  if (
    normalizedCode.length !==
      RECOVERY_CODE_GROUP_LENGTH * RECOVERY_CODE_GROUP_COUNT ||
    !/^[A-Z0-9]+$/.test(normalizedCode)
  ) {
    throw new BadRequestException('recoveryCode must be 8 letters or digits');
  }

  return normalizedCode;
}

function createRefreshToken(): string {
  return randomBytes(REFRESH_TOKEN_BYTES).toString('base64url');
}

function hashRefreshToken(refreshToken: string): string {
  return createHash('sha256').update(refreshToken).digest('hex');
}

function createSessionExpiry(authenticatedAt: Date): Date {
  return new Date(
    authenticatedAt.getTime() + SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000,
  );
}

async function useRecoveryCode(
  transaction: Prisma.TransactionClient,
  userId: string,
  recoveryCode: string,
  usedAt: Date,
): Promise<boolean> {
  const recoveryCodes = await transaction.recoveryCode.findMany({
    orderBy: {
      createdAt: 'asc',
    },
    select: {
      codeHash: true,
      id: true,
    },
    where: {
      usedAt: null,
      userId,
    },
  });

  for (const storedRecoveryCode of recoveryCodes) {
    if (await verify(storedRecoveryCode.codeHash, recoveryCode)) {
      await transaction.recoveryCode.update({
        data: {
          usedAt,
        },
        where: {
          id: storedRecoveryCode.id,
        },
      });

      return true;
    }
  }

  return false;
}

function getAuditFailureReason(error: unknown): string {
  if (error instanceof BadRequestException) {
    return 'bad_request';
  }

  if (error instanceof UnauthorizedException) {
    return error.message
      .toLowerCase()
      .replaceAll(/[^a-z0-9]+/g, '_')
      .replaceAll(/^_+|_+$/g, '');
  }

  if (error instanceof ConflictException) {
    return 'conflict';
  }

  if (error instanceof HttpException && error.getStatus() === 429) {
    return 'rate_limited';
  }

  return 'internal_error';
}
