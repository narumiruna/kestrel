import { BadRequestException, ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { argon2id, hash, verify } from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';
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
};
type MockUserClient = {
  create: jest.Mock<Promise<AuthUserRecord>, [Prisma.UserCreateArgs]>;
  findUnique: jest.Mock<
    Promise<{
      id: string;
      passwordHash?: string;
      totpEnabledAt?: Date | null;
      totpSecretEncrypted?: string | null;
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
      },
      user: {
        create: jest.fn<Promise<AuthUserRecord>, [Prisma.UserCreateArgs]>(),
        findUnique: jest.fn<
          Promise<{
            id: string;
            passwordHash?: string;
            totpEnabledAt?: Date | null;
            totpSecretEncrypted?: string | null;
          } | null>,
          [Prisma.UserFindUniqueArgs]
        >(),
        update: jest.fn<
          Promise<Record<string, unknown>>,
          [Prisma.UserUpdateArgs]
        >(),
      },
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

    expect(totpService.decryptSecret).toHaveBeenCalledWith('encrypted-secret');
    expect(totpService.verifyCode).toHaveBeenCalledWith('SECRET123', '123456');
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

  it('creates a login session after a valid TOTP code', async () => {
    const passwordHash = await hash('a-very-secure-password', {
      type: argon2id,
    });
    const authenticatedAt = new Date('2026-05-09T16:00:00.000Z');
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
      });
    });
    jest.useFakeTimers().setSystemTime(authenticatedAt);

    const result = await authService.login({
      password: 'a-very-secure-password',
      totpCode: '123456',
      username: 'alice',
    });

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
      },
    });
    expect(capturedSessionArgs?.data.refreshTokenHash).toMatch(
      /^[a-f0-9]{64}$/,
    );
    expect(result.authMethod).toBe('totp');
    expect(result.refreshToken).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(result.session).toEqual({
      createdAt: authenticatedAt,
      expiresAt: new Date('2026-06-08T16:00:00.000Z'),
      id: 'session-1',
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
    });
    jest.useFakeTimers().setSystemTime(authenticatedAt);

    const result = await authService.login({
      password: 'a-very-secure-password',
      recoveryCode: 'abcd-1234',
      username: 'alice',
    });

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
});
