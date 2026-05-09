import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { argon2id, hash } from 'argon2';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { TotpService } from './../src/auth/totp.service';
import { PrismaService } from './../src/prisma/prisma.service';

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
  lastUsedAt: Date;
  refreshTokenHash: string;
  revokedAt: Date | null;
  userId: string;
};

type AuthUserRecord = {
  createdAt: Date;
  id: string;
  passwordHash?: string;
  totpEnabledAt?: Date | null;
  totpSecretEncrypted?: string | null;
  username: string;
};

type MockPrismaService = {
  $transaction: jest.Mock<
    Promise<unknown>,
    [(transaction: TransactionClient) => Promise<unknown>]
  >;
  recoveryCode: {
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
  session: {
    create: jest.Mock<
      Promise<Record<string, unknown>>,
      [Prisma.SessionCreateArgs]
    >;
  };
  user: {
    create: jest.Mock<
      Promise<Record<string, unknown>>,
      [Prisma.UserCreateArgs]
    >;
    findUnique: jest.Mock<
      Promise<Record<string, unknown> | null>,
      [Prisma.UserFindUniqueArgs]
    >;
    update: jest.Mock<
      Promise<Record<string, unknown>>,
      [Prisma.UserUpdateArgs]
    >;
  };
};

type TotpLoginResponse = {
  authMethod: string;
  refreshToken: string;
  session: {
    createdAt: string;
    expiresAt: string;
    id: string;
  };
  user: {
    id: string;
    username: string;
  };
};

type TotpSetupResponse = {
  otpauthUrl: string;
  qrCodeDataUrl: string;
  secret: string;
  user: {
    id: string;
    username: string;
  };
};

type TotpVerifyResponse = {
  nextStep: string;
  recoveryCodes: string[];
  user: {
    id: string;
    totpEnabledAt: string;
    username: string;
  };
};

type TransactionClient = Pick<
  MockPrismaService,
  'recoveryCode' | 'session' | 'user'
>;

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;
  let prismaService: MockPrismaService;
  let storedRecoveryCodes: AuthRecoveryCodeRecord[];
  let storedSessions: AuthSessionRecord[];
  let storedUsersById: Map<string, AuthUserRecord>;
  let storedUsers: Map<string, AuthUserRecord>;

  beforeEach(async () => {
    process.env.AUTH_TOTP_ENCRYPTION_KEY =
      'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=';
    process.env.AUTH_TOTP_ISSUER = 'Kestrel Test';
    storedRecoveryCodes = [];
    storedSessions = [];
    storedUsersById = new Map();
    storedUsers = new Map();
    prismaService = {
      $transaction: jest.fn<
        Promise<unknown>,
        [(transaction: TransactionClient) => Promise<unknown>]
      >(),
      recoveryCode: {
        createMany: jest.fn((args: Prisma.RecoveryCodeCreateManyArgs) => {
          const rows = Array.isArray(args.data) ? args.data : [args.data];

          rows.forEach((row, index) => {
            storedRecoveryCodes.push({
              codeHash: row.codeHash,
              createdAt: new Date(),
              id: `recovery-${storedRecoveryCodes.length + index + 1}`,
              usedAt: null,
              userId: row.userId,
            });
          });

          return Promise.resolve({ count: rows.length });
        }),
        deleteMany: jest.fn((args: Prisma.RecoveryCodeDeleteManyArgs) => {
          const userId = args.where?.userId;
          const beforeCount = storedRecoveryCodes.length;
          storedRecoveryCodes = storedRecoveryCodes.filter(
            (record) => record.userId !== userId,
          );

          return Promise.resolve({
            count: beforeCount - storedRecoveryCodes.length,
          });
        }),
        findMany: jest.fn((args: Prisma.RecoveryCodeFindManyArgs) => {
          const userId = args.where?.userId;

          return Promise.resolve(
            storedRecoveryCodes
              .filter(
                (record) => record.userId === userId && record.usedAt == null,
              )
              .sort(
                (left, right) =>
                  left.createdAt.getTime() - right.createdAt.getTime(),
              )
              .map((record) => ({
                codeHash: record.codeHash,
                id: record.id,
              })),
          );
        }),
        update: jest.fn((args: Prisma.RecoveryCodeUpdateArgs) => {
          const recoveryCode = storedRecoveryCodes.find(
            (record) => record.id === args.where.id,
          );

          if (recoveryCode == null) {
            throw new Error('recovery code not found');
          }

          recoveryCode.usedAt =
            (args.data.usedAt as Date | string | null | undefined) == null
              ? null
              : new Date(args.data.usedAt as Date | string);

          return Promise.resolve(recoveryCode);
        }),
      },
      session: {
        create: jest.fn((args: Prisma.SessionCreateArgs) => {
          const sessionRecord: AuthSessionRecord = {
            createdAt: new Date(),
            expiresAt: new Date(args.data.expiresAt),
            id: `session-${storedSessions.length + 1}`,
            lastUsedAt: new Date(args.data.lastUsedAt),
            refreshTokenHash: String(args.data.refreshTokenHash),
            revokedAt: null,
            userId: String(args.data.userId),
          };
          storedSessions.push(sessionRecord);

          return Promise.resolve(applySelect(sessionRecord, args.select));
        }),
      },
      user: {
        create: jest.fn((args: Prisma.UserCreateArgs) => {
          const createdUser: AuthUserRecord = {
            createdAt: new Date('2026-05-09T00:00:00.000Z'),
            id: 'user-1',
            passwordHash: String(args.data.passwordHash),
            totpEnabledAt: null,
            totpSecretEncrypted: null,
            username: String(args.data.username),
          };
          storedUsersById.set(createdUser.id, createdUser);
          storedUsers.set(createdUser.username, createdUser);

          return Promise.resolve(applySelect(createdUser, args.select));
        }),
        findUnique: jest.fn((args: Prisma.UserFindUniqueArgs) => {
          const username = args.where.username;

          if (typeof username !== 'string') {
            return Promise.resolve(null);
          }

          const user = storedUsers.get(username);

          return Promise.resolve(
            user == null ? null : applySelect(user, args.select),
          );
        }),
        update: jest.fn((args: Prisma.UserUpdateArgs) => {
          const user = storedUsersById.get(String(args.where.id));

          if (user == null) {
            throw new Error('user not found');
          }

          const updatedUser = {
            ...user,
            ...args.data,
          };
          storedUsersById.set(updatedUser.id, updatedUser);
          storedUsers.set(updatedUser.username, updatedUser);

          return Promise.resolve(applySelect(updatedUser, args.select));
        }),
      },
    };
    prismaService.$transaction.mockImplementation(async (transaction) =>
      transaction({
        recoveryCode: prismaService.recoveryCode,
        session: prismaService.session,
        user: prismaService.user,
      }),
    );

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaService)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer()).get('/').expect(200).expect({
      environment: 'test',
      phase: 'bootstrap',
      service: 'kestrel-cloud-api',
    });
  });

  it('/auth/register (POST)', async () => {
    const createdAt = new Date('2026-05-09T00:00:00.000Z');

    await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        password: 'a-very-secure-password',
        username: 'alice',
      })
      .expect(201)
      .expect({
        nextStep: 'totp_setup',
        user: {
          createdAt: createdAt.toISOString(),
          id: 'user-1',
          username: 'alice',
        },
      });
  });

  it('/auth/totp/setup + /auth/totp/verify + /auth/login (POST)', async () => {
    const password = 'a-very-secure-password';
    const passwordHash = await hash(password, { type: argon2id });

    storedUsers.set('alice', {
      createdAt: new Date('2026-05-09T00:00:00.000Z'),
      id: 'user-1',
      passwordHash,
      totpEnabledAt: null,
      totpSecretEncrypted: null,
      username: 'alice',
    });
    storedUsersById.set('user-1', storedUsers.get('alice') as AuthUserRecord);

    const setupResponse = await request(app.getHttpServer())
      .post('/auth/totp/setup')
      .send({
        password,
        username: 'alice',
      })
      .expect(201);
    const setupBody = setupResponse.body as TotpSetupResponse;

    expect(setupBody.user).toEqual({
      id: 'user-1',
      username: 'alice',
    });
    expect(setupBody.secret).toMatch(/^[A-Z2-7]+$/);
    expect(setupBody.otpauthUrl).toContain('otpauth://totp/');
    expect(setupBody.qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);

    const persistedUser = storedUsers.get('alice');
    const totpService = app.get(TotpService);
    const verificationTime = new Date('2026-05-09T15:33:00.000Z');
    const totpCode = totpService.generateCode(
      totpService.decryptSecret(persistedUser?.totpSecretEncrypted ?? ''),
      verificationTime,
    );
    jest.useFakeTimers().setSystemTime(verificationTime);

    const verifyResponse = await request(app.getHttpServer())
      .post('/auth/totp/verify')
      .send({
        code: totpCode,
        password,
        username: 'alice',
      })
      .expect(201);

    const verifyBody = verifyResponse.body as TotpVerifyResponse;

    expect(verifyBody.nextStep).toBe('login');
    expect(verifyBody.user.id).toBe('user-1');
    expect(verifyBody.user.username).toBe('alice');
    expect(verifyBody.user.totpEnabledAt).toBe('2026-05-09T15:33:00.000Z');
    expect(verifyBody.recoveryCodes).toHaveLength(10);

    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        password,
        totpCode,
        username: 'alice',
      })
      .expect(201);
    const loginBody = loginResponse.body as TotpLoginResponse;

    expect(loginBody.authMethod).toBe('totp');
    expect(loginBody.refreshToken).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(loginBody.session.id).toBe('session-1');
    expect(loginBody.user).toEqual({
      id: 'user-1',
      username: 'alice',
    });

    const recoveryLoginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        password,
        recoveryCode: verifyBody.recoveryCodes[0],
        username: 'alice',
      })
      .expect(201);
    const recoveryLoginBody = recoveryLoginResponse.body as TotpLoginResponse;

    expect(recoveryLoginBody.authMethod).toBe('recovery_code');
    expect(recoveryLoginBody.session.id).toBe('session-2');
    expect(storedSessions).toHaveLength(2);
    expect(storedRecoveryCodes[0]?.usedAt?.toISOString()).toBe(
      '2026-05-09T15:33:00.000Z',
    );
  });

  afterEach(async () => {
    jest.useRealTimers();
    await app.close();
    delete process.env.AUTH_TOTP_ENCRYPTION_KEY;
    delete process.env.AUTH_TOTP_ISSUER;
  });
});

function applySelect(
  record: Record<string, unknown>,
  select: Record<string, boolean> | null | undefined,
): Record<string, unknown> {
  if (select == null) {
    return { ...record };
  }

  return Object.fromEntries(
    Object.entries(select)
      .filter(([, value]) => value === true)
      .map(([key]) => [key, record[key] ?? null]),
  );
}
