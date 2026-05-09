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

type MockPrismaService = {
  user: {
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
    update: jest.Mock<
      Promise<Record<string, unknown>>,
      [Prisma.UserUpdateArgs]
    >;
  };
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

describe('AuthService', () => {
  let authService: AuthService;
  let prismaService: MockPrismaService;
  let totpService: MockTotpService;

  afterEach(() => {
    jest.useRealTimers();
  });

  beforeEach(async () => {
    prismaService = {
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

    prismaService.user.findUnique.mockResolvedValue({
      id: 'user-1',
      passwordHash,
      totpEnabledAt: null,
      totpSecretEncrypted: 'encrypted-secret',
      username: 'alice',
    });
    totpService.decryptSecret.mockReturnValue('SECRET123');
    totpService.verifyCode.mockReturnValue(true);
    prismaService.user.update.mockResolvedValue({
      id: 'user-1',
      totpEnabledAt: enabledAt,
      username: 'alice',
    });
    jest.useFakeTimers().setSystemTime(enabledAt);

    const result = await authService.verifyTotp({
      code: '123456',
      password: 'a-very-secure-password',
      username: 'alice',
    });

    expect(totpService.decryptSecret).toHaveBeenCalledWith('encrypted-secret');
    expect(totpService.verifyCode).toHaveBeenCalledWith('SECRET123', '123456');
    expect(prismaService.user.update).toHaveBeenCalledWith({
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
    expect(result).toEqual({
      nextStep: 'login',
      user: {
        id: 'user-1',
        totpEnabledAt: enabledAt,
        username: 'alice',
      },
    });
  });
});
