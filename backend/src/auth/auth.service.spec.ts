import { BadRequestException, ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { verify } from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';

type AuthUserRecord = {
  createdAt: Date;
  id: string;
  username: string;
};

type MockPrismaService = {
  user: {
    create: jest.Mock<Promise<AuthUserRecord>, [Prisma.UserCreateArgs]>;
    findUnique: jest.Mock<
      Promise<{ id: string } | null>,
      [Prisma.UserFindUniqueArgs]
    >;
  };
};

describe('AuthService', () => {
  let authService: AuthService;
  let prismaService: MockPrismaService;

  beforeEach(async () => {
    prismaService = {
      user: {
        create: jest.fn<Promise<AuthUserRecord>, [Prisma.UserCreateArgs]>(),
        findUnique: jest.fn<
          Promise<{ id: string } | null>,
          [Prisma.UserFindUniqueArgs]
        >(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: PrismaService,
          useValue: prismaService,
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
});
