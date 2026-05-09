import { BadRequestException, ConflictException, UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { argon2id, hash, verify } from 'argon2';
import { AccessTokenService } from './access-token.service';
import { AuthAuditService } from './auth-audit.service';
import { AuthRateLimitService, AUTH_RATE_LIMIT_TYPE } from './auth-rate-limit.service';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { TotpService } from './totp.service';

type AuthUserRecord = {
  createdAt: Date;
  id: string;
  username: string;
};

type AuthRecoveryCodeRow = Prisma.RecoveryCodeCreateManyInput;
type AuthRecoveryCodeRecord = {
  codeHash: string;
  createdAt: Date;
  id: string;
  usedAt: Date | null;
  userId: string;
};
type AuthSessionRecord = {
  createdAt: Date;
  expiresAt: Date;
  id: string;
  lastUsedAt?: Date;
  revokedAt?: Date | null;
  user?: {
    username: string;
  };
  userId?: string;
};
type MockRecoveryCodeClient = {
  createMany: jest.Mock<
    Promise<{ count: number }>,
    [Prisma.RecoveryCodeCreateManyArgs]
  >;
  deleteMany: jest.Mock<
    Promise<{ count: number }>,
    [Prisma.RecoveryCodeDeleteManyArgs]
  >;
  findMany: jest.Mock<
    Promise<Array<Pick<AuthRecoveryCodeRecord, 'codeHash' | 'id'>>>,
    [Prisma.RecoveryCodeFindManyArgs]
  >;
  update: jest.Mock<
    Promise<AuthRecoveryCodeRecord>,
    [Prisma.RecoveryCodeUpdateArgs]
  >;
};
type MockSessionClient = {
  create: jest.Mock<Promise<AuthSessionRecord>, [Prisma.SessionCreateArgs]>;
  findUnique: jest.Mock<
    Promise<Record<string, unknown> | null>,
    [Prisma.SessionFindUniqueArgs]
  >;
  update: jest.Mock<Promise<AuthSessionRecord>, [Prisma.SessionUpdateArgs]>;
};
type MockUserClient = {
  create: jest.Mock<Promise<AuthUserRecord>, [Prisma.UserCreateArgs]>;
  findUnique: jest.Mock<
    Promise<{
      id: string;
      passwordHash?: string;
      totpEnabledAt?: Date | null;
      totpSecretEncrypted?: string | null;
      username: string;
    } | null>,
    [Prisma.UserFindUniqueArgs]
  >;
  update: jest.Mock<Promise<Record<string, unknown>>, [Prisma.UserUpdateArgs]>;
};
type MockTransactionClient = {
  recoveryCode: MockRecoveryCodeClient;
  session: MockSessionClient;
  user: MockUserClient;
};

type MockPrismaService = {
  $transaction: jest.Mock<
    Promise<unknown>,
    [(transaction: MockTransactionClient) => Promise<unknown>]
  >;
  recoveryCode: MockRecoveryCodeClient;
  session: MockSessionClient;
  user: MockUserClient;
};

type MockTotpService = {
  createSetup: jest.Mock<
    Promise<{
      encryptedSecret: string;
      otpauthUrl: string;
      qrCodeDataUrl: string;
      secret: string;
    }>,
    [string]
  >;
  decryptSecret: jest.Mock<string, [string]>;
  verifyCode: jest.Mock<boolean, [string, string]>;
};

type MockAccessTokenService = {
  issueToken: jest.Mock<
    {
      expiresAt: Date;
      token: string;
    },
    [
      {
        sessionId: string;
        userId: string;
      },
      Date | undefined?,
    ]
  >;
  verifyToken: jest.Mock<
    {
      expiresAt: Date;
      sessionId: string;
      userId: string;
    },
    [string]
  >;
};

type MockAuthRateLimitService = {
  assertAllowed: jest.Mock<Promise<void>, [string, string]>;
  recordFailure: jest.Mock<Promise<void>, [string, string]>;
  reset: jest.Mock<Promise<void>, [string, string]>;
};

type MockAuthAuditService = {
  log: jest.Mock<Promise<void>, [Record<string, unknown>]>;
};

function getCreateManyRows(
  args: Prisma.RecoveryCodeCreateManyArgs | undefined,
): AuthRecoveryCodeRow[] {
  if (args?.data == null) {
    return [];
  }

  if (Array.isArray(args.data)) {
    return args.data;
  }

  return [args.data];
}

async function expectRecoveryCodeHashesToMatch(
  recoveryCodeRows: AuthRecoveryCodeRow[],
  recoveryCodes: string[],
) {
  await Promise.all(
    recoveryCodes.map((recoveryCode, index) =>
      expect(
        verify(
          recoveryCodeRows[index]?.codeHash ?? '',
          recoveryCode.replaceAll('-', ''),
        ),
      ).resolves.toBe(true),
    ),
  );
}

describe('AuthService', () => {
  let accessTokenService: MockAccessTokenService;
  let authAuditService: MockAuthAuditService;
  let authRateLimitService: MockAuthRateLimitService;
  let authService: AuthService;
  let prismaService: MockPrismaService;
  let totpService: MockTotpService;

  afterEach(() => {
    jest.useRealTimers();
  });

  beforeEach(async () => {
    prismaService = {
      $transaction: jest.fn<
        Promise<unknown>,
        [(transaction: MockTransactionClient) => Promise<unknown>]
      >(),
      recoveryCode: {
        createMany: jest.fn<
          Promise<{ count: number }>,
          [Prisma.RecoveryCodeCreateManyArgs]
        >(),
        deleteMany: jest.fn<
          Promise<{ count: number }>,
          [Prisma.RecoveryCodeDeleteManyArgs]
        >(),
        findMany: jest.fn<
          Promise<Array<Pick<AuthRecoveryCodeRecord, 'codeHash' | 'id'>>>,
          [Prisma.RecoveryCodeFindManyArgs]
        >(),
        update: jest.fn<
          Promise<AuthRecoveryCodeRecord>,
          [Prisma.RecoveryCodeUpdateArgs]
        >(),
      },
      session: {
        create: jest.fn<
          Promise<AuthSessionRecord>,
          [Prisma.SessionCreateArgs]
        >(),
        findUnique: jest.fn<
          Promise<Record<string, unknown> | null>,
          [Prisma.SessionFindUniqueArgs]
        >(),
        update: jest.fn<
          Promise<AuthSessionRecord>,
          [Prisma.SessionUpdateArgs]
        >(),
      },
      user: {
        create: jest.fn<Promise<AuthUserRecord>, [Prisma.UserCreateArgs]>(),
        findUnique: jest.fn<
          Promise<{
            id: string;
            passwordHash?: string;
            totpEnabledAt?: Date | null;
            totpSecretEncrypted?: string | null;
            username: string;
          } | null>,
          [Prisma.UserFindUniqueArgs]
        >(),
        update: jest.fn<
          Promise<Record<string, unknown>>,
          [Prisma.UserUpdateArgs]
        >(),
      },
    };
    accessTokenService = {
      issueToken: jest.fn(),
      verifyToken: jest.fn(),
    };
    authRateLimitService = {
      assertAllowed: jest.fn().mockResolvedValue(undefined),
      recordFailure: jest.fn().mockResolvedValue(undefined),
      reset: jest.fn().mockResolvedValue(undefined),
    };
    authAuditService = {
      log: jest.fn().mockResolvedValue(undefined),
    };
    totpService = {
      createSetup: jest.fn<
        Promise<{
          encryptedSecret: string;
          otpauthUrl: string;
          qrCodeDataUrl: string;
          secret: string;
        }>,
        [string]
      >(),
      decryptSecret: jest.fn<string, [string]>(),
      verifyCode: jest.fn<boolean, [string, string]>(),
    };
    prismaService.$transaction.mockImplementation(async (transaction) =>
      transaction({
        recoveryCode: prismaService.recoveryCode,
        session: prismaService.session,
        user: prismaService.user,
      }),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: AccessTokenService,
          useValue: accessTokenService,
        },
        {
          provide: AuthAuditService,
          useValue: authAuditService,
        },
        {
          provide: AuthRateLimitService,
          useValue: authRateLimitService,
        },
        {
          provide: PrismaService,
          useValue: prismaService,
        },
        {
          provide: TotpService,
          useValue: totpService,
        },
      ],
    }).compile();

    authService = module.get<AuthService>(AuthService);
  });

  it('creates a user with an Argon2id password hash', async () => {
    const createdAt = new Date('2026-05-09T00:00:00.000Z');
    let capturedCreateArgs: Prisma.UserCreateArgs | undefined;

    prismaService.user.findUnique.mockResolvedValue(null);
    prismaService.user.create.mockImplementation((args) => {
      capturedCreateArgs = args;

      return Promise.resolve({
        createdAt,
        id: 'user-1',
        username: args.data.username,
      });
    });

    const result = await authService.register({
      password: 'a-very-secure-password',
      username: 'alice',
    });

    expect(prismaService.user.findUnique).toHaveBeenCalledWith({
      select: { id: true },
      where: { username: 'alice' },
    });
    expect(prismaService.user.create).toHaveBeenCalledTimes(1);
    expect(capturedCreateArgs).toBeDefined();
    expect(capturedCreateArgs?.data.username).toBe('alice');
    expect(capturedCreateArgs?.data.passwordHash).not.toBe(
      'a-very-secure-password',
    );
    await expect(
      verify(
        capturedCreateArgs?.data.passwordHash ?? '',
        'a-very-secure-password',
      ),
    ).resolves.toBe(true);
    expect(result).toEqual({
      nextStep: 'totp_setup',
      user: {
        createdAt,
        id: 'user-1',
        username: 'alice',
      },
    });
  });

  it('rejects duplicate usernames', async () => {
    prismaService.user.findUnique.mockResolvedValue({ id: 'existing-user' });

    await expect(
      authService.register({
        password: 'a-very-secure-password',
        username: 'alice',
      }),
    ).rejects.toThrow(ConflictException);
    expect(prismaService.user.create).not.toHaveBeenCalled();
  });

  it('rejects invalid registration payloads', async () => {
    await expect(
      authService.register({
        password: 'short',
        username: 'alice',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(prismaService.user.findUnique).not.toHaveBeenCalled();
  });

  it('starts TOTP setup after validating credentials', async () => {
    const passwordHash = await hash('a-very-secure-password', {
      type: argon2id,
    });

    prismaService.user.findUnique.mockResolvedValue({
      id: 'user-1',
      passwordHash,
      totpEnabledAt: null,
      totpSecretEncrypted: null,
      username: 'alice',
    });
    totpService.createSetup.mockResolvedValue({
      encryptedSecret: 'encrypted-secret',
      otpauthUrl: 'otpauth://totp/test',
      qrCodeDataUrl: 'data:image/png;base64,abc',
      secret: 'SECRET123',
    });
    prismaService.user.update.mockResolvedValue({
      id: 'user-1',
      username: 'alice',
    });

    const result = await authService.setupTotp({
      password: 'a-very-secure-password',
      username: 'alice',
    });

    expect(authRateLimitService.assertAllowed).toHaveBeenCalledWith(
      AUTH_RATE_LIMIT_TYPE.PASSWORD,
      'alice',
    );
    expect(authRateLimitService.reset).toHaveBeenCalledWith(
      AUTH_RATE_LIMIT_TYPE.PASSWORD,
      'alice',
    );
    expect(totpService.createSetup).toHaveBeenCalledWith('alice');
    expect(prismaService.user.update).toHaveBeenCalledWith({
      data: {
        totpEnabledAt: null,
        totpSecretEncrypted: 'encrypted-secret',
      },
      select: {
        id: true,
        username: true,
      },
      where: {
        id: 'user-1',
      },
    });
    expect(result).toEqual({
      otpauthUrl: 'otpauth://totp/test',
      qrCodeDataUrl: 'data:image/png;base64,abc',
      secret: 'SECRET123',
      user: {
        id: 'user-1',
        username: 'alice',
      },
    });
  });

  it('enables TOTP after a valid verification code', async () => {
    const passwordHash = await hash('a-very-secure-password', {
      type: argon2id,
    });
    const enabledAt = new Date('2026-05-09T15:40:00.000Z');
    let capturedUpdateArgs: Prisma.UserUpdateArgs | undefined;
    let capturedCreateManyArgs: Prisma.RecoveryCodeCreateManyArgs | undefined;

    prismaService.user.findUnique.mockResolvedValue({
      id: 'user-1',
      passwordHash,
      totpEnabledAt: null,
      totpSecretEncrypted: 'encrypted-secret',
      username: 'alice',
    });
    totpService.decryptSecret.mockReturnValue('SECRET123');
    totpService.verifyCode.mockReturnValue(true);
    prismaService.recoveryCode.deleteMany.mockResolvedValue({ count: 0 });
    prismaService.recoveryCode.createMany.mockImplementation((args) => {
      capturedCreateManyArgs = args;
      const rows = Array.isArray(args.data) ? args.data : [args.data];

      return Promise.resolve({
        count: rows.length,
      });
    });
    prismaService.user.update.mockImplementation((args) => {
      capturedUpdateArgs = args;

      return Promise.resolve({
        id: 'user-1',
        totpEnabledAt: enabledAt,
        username: 'alice',
      });
    });
    jest.useFakeTimers().setSystemTime(enabledAt);

    const result = await authService.verifyTotp({
      code: '123456',
      password: 'a-very-secure-password',
      username: 'alice',
    });

    expect(authRateLimitService.assertAllowed).toHaveBeenNthCalledWith(
      1,
      AUTH_RATE_LIMIT_TYPE.PASSWORD,
      'alice',
    );
    expect(authRateLimitService.assertAllowed).toHaveBeenNthCalledWith(
      2,
      AUTH_RATE_LIMIT_TYPE.TOTP,
      'alice',
    );
    expect(totpService.decryptSecret).toHaveBeenCalledWith('encrypted-secret');
    expect(totpService.verifyCode).toHaveBeenCalledWith('SECRET123', '123456');
    expect(authRateLimitService.reset).toHaveBeenCalledWith(
      AUTH_RATE_LIMIT_TYPE.TOTP,
      'alice',
    );
    expect(prismaService.recoveryCode.deleteMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
      },
    });
    expect(prismaService.recoveryCode.createMany).toHaveBeenCalledTimes(1);
    expect(prismaService.user.update).toHaveBeenCalledTimes(1);
    expect(capturedUpdateArgs).toBeDefined();
    expect(capturedUpdateArgs).toMatchObject({
      data: {
        totpEnabledAt: enabledAt,
      },
      select: {
        id: true,
        totpEnabledAt: true,
        username: true,
      },
      where: {
        id: 'user-1',
      },
    });

    expect(capturedCreateManyArgs).toBeDefined();
    const recoveryCodeRows = getCreateManyRows(capturedCreateManyArgs);

    expect(recoveryCodeRows).toHaveLength(10);
    for (const recoveryCodeRow of recoveryCodeRows) {
      expect(recoveryCodeRow.userId).toBe('user-1');
      expect(recoveryCodeRow.codeHash).toMatch(/^\$argon2id\$/);
    }
    expect(result.user).toEqual({
      id: 'user-1',
      totpEnabledAt: enabledAt,
      username: 'alice',
    });
    expect(result.nextStep).toBe('login');
    expect(result).toMatchObject({
      nextStep: 'login',
      user: {
        id: 'user-1',
        totpEnabledAt: enabledAt,
        username: 'alice',
      },
    });
    expect(result.recoveryCodes).toHaveLength(10);
    expect(new Set(result.recoveryCodes).size).toBe(10);
    for (const recoveryCode of result.recoveryCodes) {
      expect(recoveryCode).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    }
    await expectRecoveryCodeHashesToMatch(
      recoveryCodeRows,
      result.recoveryCodes,
    );
  });

  it('creates a login session with access and refresh tokens after a valid TOTP code', async () => {
    const passwordHash = await hash('a-very-secure-password', {
      type: argon2id,
    });
    const authenticatedAt = new Date('2026-05-09T16:00:00.000Z');
    const accessTokenExpiresAt = new Date('2026-05-09T16:15:00.000Z');
    let capturedSessionArgs: Prisma.SessionCreateArgs | undefined;

    prismaService.user.findUnique.mockResolvedValue({
      id: 'user-1',
      passwordHash,
      totpEnabledAt: authenticatedAt,
      totpSecretEncrypted: 'encrypted-secret',
      username: 'alice',
    });
    totpService.decryptSecret.mockReturnValue('SECRET123');
    totpService.verifyCode.mockReturnValue(true);
    prismaService.session.create.mockImplementation((args) => {
      capturedSessionArgs = args;

      return Promise.resolve({
        createdAt: authenticatedAt,
        expiresAt: new Date('2026-06-08T16:00:00.000Z'),
        id: 'session-1',
        lastUsedAt: authenticatedAt,
      });
    });
    accessTokenService.issueToken.mockReturnValue({
      expiresAt: accessTokenExpiresAt,
      token: 'access-token',
    });
    jest.useFakeTimers().setSystemTime(authenticatedAt);

    const result = await authService.login(
      {
        password: 'a-very-secure-password',
        totpCode: '123456',
        username: 'alice',
      },
      {
        ipAddress: '127.0.0.1',
        userAgent: 'jest',
      },
    );

    expect(totpService.decryptSecret).toHaveBeenCalledWith('encrypted-secret');
    expect(totpService.verifyCode).toHaveBeenCalledWith('SECRET123', '123456');
    expect(prismaService.session.create).toHaveBeenCalledTimes(1);
    expect(capturedSessionArgs).toMatchObject({
      data: {
        expiresAt: new Date('2026-06-08T16:00:00.000Z'),
        lastUsedAt: authenticatedAt,
        userId: 'user-1',
      },
      select: {
        createdAt: true,
        expiresAt: true,
        id: true,
        lastUsedAt: true,
      },
    });
    expect(capturedSessionArgs?.data.refreshTokenHash).toMatch(
      /^[a-f0-9]{64}$/,
    );
    expect(accessTokenService.issueToken).toHaveBeenCalledWith(
      {
        sessionId: 'session-1',
        userId: 'user-1',
      },
      authenticatedAt,
    );
    expect(authAuditService.log).toHaveBeenCalledWith({
      authMethod: 'totp',
      event: 'login',
      ipAddress: '127.0.0.1',
      outcome: 'success',
      sessionId: 'session-1',
      userAgent: 'jest',
      userId: 'user-1',
      username: 'alice',
    });
    expect(result.accessToken).toBe('access-token');
    expect(result.accessTokenExpiresAt).toEqual(accessTokenExpiresAt);
    expect(result.authMethod).toBe('totp');
    expect(result.refreshToken).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(result.session).toEqual({
      createdAt: authenticatedAt,
      expiresAt: new Date('2026-06-08T16:00:00.000Z'),
      id: 'session-1',
      lastUsedAt: authenticatedAt,
    });
    expect(result.user).toEqual({
      id: 'user-1',
      username: 'alice',
    });
  });

  it('consumes a recovery code when logging in without a TOTP code', async () => {
    const passwordHash = await hash('a-very-secure-password', {
      type: argon2id,
    });
    const recoveryCodeHash = await hash('ABCD1234', {
      type: argon2id,
    });
    const authenticatedAt = new Date('2026-05-09T16:05:00.000Z');

    prismaService.user.findUnique.mockResolvedValue({
      id: 'user-1',
      passwordHash,
      totpEnabledAt: authenticatedAt,
      totpSecretEncrypted: 'encrypted-secret',
      username: 'alice',
    });
    prismaService.recoveryCode.findMany.mockResolvedValue([
      {
        codeHash: recoveryCodeHash,
        id: 'recovery-1',
      },
    ]);
    prismaService.recoveryCode.update.mockResolvedValue({
      codeHash: recoveryCodeHash,
      createdAt: new Date('2026-05-09T15:40:00.000Z'),
      id: 'recovery-1',
      usedAt: authenticatedAt,
      userId: 'user-1',
    });
    prismaService.session.create.mockResolvedValue({
      createdAt: authenticatedAt,
      expiresAt: new Date('2026-06-08T16:05:00.000Z'),
      id: 'session-2',
      lastUsedAt: authenticatedAt,
    });
    accessTokenService.issueToken.mockReturnValue({
      expiresAt: new Date('2026-05-09T16:20:00.000Z'),
      token: 'access-token',
    });
    jest.useFakeTimers().setSystemTime(authenticatedAt);

    const result = await authService.login({
      password: 'a-very-secure-password',
      recoveryCode: 'abcd-1234',
      username: 'alice',
    });

    expect(authRateLimitService.assertAllowed).toHaveBeenCalledWith(
      AUTH_RATE_LIMIT_TYPE.RECOVERY_CODE,
      'alice',
    );
    expect(prismaService.recoveryCode.findMany).toHaveBeenCalledWith({
      orderBy: {
        createdAt: 'asc',
      },
      select: {
        codeHash: true,
        id: true,
      },
      where: {
        usedAt: null,
        userId: 'user-1',
      },
    });
    expect(prismaService.recoveryCode.update).toHaveBeenCalledWith({
      data: {
        usedAt: authenticatedAt,
      },
      where: {
        id: 'recovery-1',
      },
    });
    expect(prismaService.session.create).toHaveBeenCalledTimes(1);
    expect(result.authMethod).toBe('recovery_code');
    expect(result.session.id).toBe('session-2');
  });

  it('records a failed login audit entry when the password is invalid', async () => {
    const passwordHash = await hash('a-very-secure-password', {
      type: argon2id,
    });

    prismaService.user.findUnique.mockResolvedValue({
      id: 'user-1',
      passwordHash,
      totpEnabledAt: null,
      totpSecretEncrypted: null,
      username: 'alice',
    });

    await expect(
      authService.login({
        password: 'wrong-password-value',
        totpCode: '123456',
        username: 'alice',
      }),
    ).rejects.toThrow(UnauthorizedException);
    expect(authRateLimitService.recordFailure).toHaveBeenCalledWith(
      AUTH_RATE_LIMIT_TYPE.PASSWORD,
      'alice',
    );
    expect(authAuditService.log).toHaveBeenCalledWith({
      authMethod: 'password',
      event: 'login',
      failureReason: 'invalid_username_or_password',
      outcome: 'failure',
      userId: undefined,
      username: 'alice',
    });
  });

  it('rotates the refresh token for an active session', async () => {
    const refreshedAt = new Date('2026-05-09T16:30:00.000Z');
    const accessTokenExpiresAt = new Date('2026-05-09T16:45:00.000Z');
    const originalRefreshToken = 'refresh-token';
    const originalRefreshTokenHash = await createRefreshTokenHash(
      originalRefreshToken,
    );
    let capturedUpdateArgs: Prisma.SessionUpdateArgs | undefined;

    prismaService.session.findUnique.mockResolvedValue({
      expiresAt: new Date('2026-06-08T16:00:00.000Z'),
      id: 'session-1',
      revokedAt: null,
      user: {
        username: 'alice',
      },
      userId: 'user-1',
    });
    prismaService.session.update.mockImplementation((args) => {
      capturedUpdateArgs = args;

      return Promise.resolve({
        createdAt: new Date('2026-05-09T16:00:00.000Z'),
        expiresAt: new Date('2026-06-08T16:00:00.000Z'),
        id: 'session-1',
        lastUsedAt: refreshedAt,
      });
    });
    accessTokenService.issueToken.mockReturnValue({
      expiresAt: accessTokenExpiresAt,
      token: 'rotated-access-token',
    });
    jest.useFakeTimers().setSystemTime(refreshedAt);

    const result = await authService.refresh(
      {
        refreshToken: originalRefreshToken,
      },
      {
        ipAddress: '127.0.0.1',
      },
    );

    expect(prismaService.session.findUnique).toHaveBeenCalledWith({
      select: {
        expiresAt: true,
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
        refreshTokenHash: originalRefreshTokenHash,
      },
    });
    expect(capturedUpdateArgs).toMatchObject({
      data: {
        lastUsedAt: refreshedAt,
      },
      select: {
        createdAt: true,
        expiresAt: true,
        id: true,
        lastUsedAt: true,
      },
      where: {
        id: 'session-1',
      },
    });
    expect(capturedUpdateArgs?.data.refreshTokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.accessToken).toBe('rotated-access-token');
    expect(result.accessTokenExpiresAt).toEqual(accessTokenExpiresAt);
    expect(result.refreshToken).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(result.session.lastUsedAt).toEqual(refreshedAt);
    expect(result.user).toEqual({
      id: 'user-1',
      username: 'alice',
    });
  });

  it('revokes the current session from a valid access token', async () => {
    const revokedAt = new Date('2026-05-09T16:45:00.000Z');

    accessTokenService.verifyToken.mockReturnValue({
      expiresAt: new Date('2026-05-09T17:00:00.000Z'),
      sessionId: 'session-1',
      userId: 'user-1',
    });
    prismaService.session.findUnique.mockResolvedValue({
      id: 'session-1',
      revokedAt: null,
      user: {
        username: 'alice',
      },
      userId: 'user-1',
    });
    prismaService.session.update.mockResolvedValue({
      createdAt: new Date('2026-05-09T16:00:00.000Z'),
      expiresAt: new Date('2026-06-08T16:00:00.000Z'),
      id: 'session-1',
      revokedAt,
    });
    jest.useFakeTimers().setSystemTime(revokedAt);

    const result = await authService.revokeSession('access-token', {
      userAgent: 'jest',
    });

    expect(accessTokenService.verifyToken).toHaveBeenCalledWith('access-token');
    expect(prismaService.session.update).toHaveBeenCalledWith({
      data: {
        revokedAt,
      },
      select: {
        id: true,
        revokedAt: true,
      },
      where: {
        id: 'session-1',
      },
    });
    expect(authAuditService.log).toHaveBeenCalledWith({
      authMethod: 'access_token',
      event: 'session_revoke',
      outcome: 'success',
      sessionId: 'session-1',
      userAgent: 'jest',
      userId: 'user-1',
      username: 'alice',
    });
    expect(result).toEqual({
      session: {
        id: 'session-1',
        revokedAt,
      },
    });
  });
});

async function createRefreshTokenHash(refreshToken: string): Promise<string> {
  const { createHash } = await import('node:crypto');

  return createHash('sha256').update(refreshToken).digest('hex');
}
