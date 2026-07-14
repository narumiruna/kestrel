import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { argon2id, hash } from 'argon2';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { TotpService } from './../src/auth/totp.service';
import { PrismaService } from './../src/prisma/prisma.service';

type AuthAuditLogRecord = {
  authMethod: string | null;
  createdAt: Date;
  event: string;
  failureReason: string | null;
  id: string;
  ipAddress: string | null;
  outcome: string;
  sessionId: string | null;
  userAgent: string | null;
  userId: string | null;
  username: string | null;
};

type AuthRefreshTokenHistoryRecord = {
  consumedAt: Date;
  expiresAt: Date;
  id: string;
  sessionId: string;
  tokenHash: string;
};

type AuthRateLimitRecord = {
  attempts: number;
  blockedUntil: Date | null;
  createdAt: Date;
  id: string;
  subject: string;
  type: string;
  updatedAt: Date;
  windowStartedAt: Date;
};

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
  previousRefreshTokenHash: string | null;
  refreshRequestId: string | null;
  refreshTokenHash: string;
  refreshTokenRotatedAt: Date | null;
  revokedAt: Date | null;
  rotatedRefreshTokenEncrypted: string | null;
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
  $queryRaw: jest.Mock<Promise<unknown>, unknown[]>;
  $transaction: jest.Mock<
    Promise<unknown>,
    [(transaction: TransactionClient) => Promise<unknown>]
  >;
  authAuditLog: {
    create: jest.Mock<
      Promise<AuthAuditLogRecord>,
      [Prisma.AuthAuditLogCreateArgs]
    >;
  };
  device: {
    findMany: jest.Mock<Promise<Array<Record<string, unknown>>>, [unknown]>;
    updateMany: jest.Mock<Promise<{ count: number }>, [unknown]>;
  };
  remoteCommand: {
    updateMany: jest.Mock<Promise<{ count: number }>, [unknown]>;
  };
  authRateLimit: {
    deleteMany: jest.Mock<
      Promise<{ count: number }>,
      [Prisma.AuthRateLimitDeleteManyArgs]
    >;
    findUnique: jest.Mock<
      Promise<AuthRateLimitRecord | null>,
      [Prisma.AuthRateLimitFindUniqueArgs]
    >;
    update: jest.Mock<
      Promise<AuthRateLimitRecord>,
      [Prisma.AuthRateLimitUpdateArgs]
    >;
    upsert: jest.Mock<
      Promise<AuthRateLimitRecord>,
      [Prisma.AuthRateLimitUpsertArgs]
    >;
  };
  refreshTokenHistory: {
    create: jest.Mock<
      Promise<Record<string, unknown>>,
      [Prisma.RefreshTokenHistoryCreateArgs]
    >;
    deleteMany: jest.Mock<
      Promise<Prisma.BatchPayload>,
      [Prisma.RefreshTokenHistoryDeleteManyArgs]
    >;
    findUnique: jest.Mock<
      Promise<Record<string, unknown> | null>,
      [Prisma.RefreshTokenHistoryFindUniqueArgs]
    >;
  };
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
    findUnique: jest.Mock<
      Promise<Record<string, unknown> | null>,
      [Prisma.SessionFindUniqueArgs]
    >;
    update: jest.Mock<
      Promise<Record<string, unknown>>,
      [Prisma.SessionUpdateArgs]
    >;
    updateMany: jest.Mock<
      Promise<{ count: number }>,
      [Prisma.SessionUpdateManyArgs]
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
  accessToken: string;
  accessTokenExpiresAt: string;
  authMethod: string;
  refreshToken: string;
  session: {
    createdAt: string;
    expiresAt: string;
    id: string;
    lastUsedAt: string;
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
  | 'device'
  | 'recoveryCode'
  | 'refreshTokenHistory'
  | 'remoteCommand'
  | 'session'
  | 'user'
>;

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;
  let prismaService: MockPrismaService;
  let storedAuditLogs: AuthAuditLogRecord[];
  let storedRateLimits: Map<string, AuthRateLimitRecord>;
  let storedRecoveryCodes: AuthRecoveryCodeRecord[];
  let storedRefreshTokenHistory: AuthRefreshTokenHistoryRecord[];
  let storedSessions: AuthSessionRecord[];
  let storedUsersById: Map<string, AuthUserRecord>;
  let storedUsers: Map<string, AuthUserRecord>;

  beforeEach(async () => {
    process.env.AUTH_ACCESS_TOKEN_SECRET = 'kestrel-test-access-token-secret';
    process.env.AUTH_ACCESS_TOKEN_TTL_SECONDS = '900';
    process.env.AUTH_TOTP_ENCRYPTION_KEY =
      'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=';
    process.env.AUTH_TOTP_ISSUER = 'Kestrel Test';
    storedAuditLogs = [];
    storedRateLimits = new Map();
    storedRecoveryCodes = [];
    storedRefreshTokenHistory = [];
    storedSessions = [];
    storedUsersById = new Map();
    storedUsers = new Map();
    prismaService = {
      $queryRaw: jest
        .fn<Promise<unknown>, unknown[]>()
        .mockResolvedValue([{ ready: 1 }]),
      $transaction: jest.fn<
        Promise<unknown>,
        [(transaction: TransactionClient) => Promise<unknown>]
      >(),
      authAuditLog: {
        create: jest.fn((args: Prisma.AuthAuditLogCreateArgs) => {
          const record: AuthAuditLogRecord = {
            authMethod: toNullableString(args.data.authMethod),
            createdAt: new Date(),
            event: String(args.data.event),
            failureReason: toNullableString(args.data.failureReason),
            id: `audit-${storedAuditLogs.length + 1}`,
            ipAddress: toNullableString(args.data.ipAddress),
            outcome: String(args.data.outcome),
            sessionId: toNullableString(args.data.sessionId),
            userAgent: toNullableString(args.data.userAgent),
            userId: toNullableString(args.data.userId),
            username: toNullableString(args.data.username),
          };
          storedAuditLogs.push(record);

          return Promise.resolve(record);
        }),
      },
      device: {
        findMany: jest
          .fn<Promise<Array<Record<string, unknown>>>, [unknown]>()
          .mockResolvedValue([]),
        updateMany: jest
          .fn<Promise<{ count: number }>, [unknown]>()
          .mockResolvedValue({ count: 0 }),
      },
      remoteCommand: {
        updateMany: jest
          .fn<Promise<{ count: number }>, [unknown]>()
          .mockResolvedValue({ count: 0 }),
      },
      authRateLimit: {
        deleteMany: jest.fn((args: Prisma.AuthRateLimitDeleteManyArgs) => {
          const type = args.where?.type;
          const subject = args.where?.subject;

          if (typeof type !== 'string' || typeof subject !== 'string') {
            return Promise.resolve({ count: 0 });
          }

          const key = getRateLimitKey(type, subject);
          const deleted = storedRateLimits.delete(key);

          return Promise.resolve({ count: deleted ? 1 : 0 });
        }),
        findUnique: jest.fn((args: Prisma.AuthRateLimitFindUniqueArgs) => {
          const compositeWhere = args.where.type_subject;

          return Promise.resolve(
            storedRateLimits.get(
              getRateLimitKey(compositeWhere.type, compositeWhere.subject),
            ) ?? null,
          );
        }),
        update: jest.fn((args: Prisma.AuthRateLimitUpdateArgs) => {
          const compositeWhere = args.where.type_subject;
          const key = getRateLimitKey(
            compositeWhere.type,
            compositeWhere.subject,
          );
          const existing = storedRateLimits.get(key);

          if (existing == null) {
            throw new Error('rate limit not found');
          }

          const updatedRecord: AuthRateLimitRecord = {
            ...existing,
            attempts: Number(args.data.attempts),
            blockedUntil: toNullableDate(args.data.blockedUntil),
            updatedAt: new Date(),
          };
          storedRateLimits.set(key, updatedRecord);

          return Promise.resolve(updatedRecord);
        }),
        upsert: jest.fn((args: Prisma.AuthRateLimitUpsertArgs) => {
          const compositeWhere = args.where.type_subject;
          const key = getRateLimitKey(
            compositeWhere.type,
            compositeWhere.subject,
          );
          const existing = storedRateLimits.get(key);

          if (existing != null) {
            const updatedRecord: AuthRateLimitRecord = {
              ...existing,
              attempts: Number(args.update.attempts),
              blockedUntil: toNullableDate(args.update.blockedUntil),
              updatedAt: new Date(),
              windowStartedAt: new Date(args.update.windowStartedAt as Date),
            };
            storedRateLimits.set(key, updatedRecord);

            return Promise.resolve(updatedRecord);
          }

          const createdRecord: AuthRateLimitRecord = {
            attempts: Number(args.create.attempts),
            blockedUntil: toNullableDate(args.create.blockedUntil),
            createdAt: new Date(),
            id: `rate-limit-${storedRateLimits.size + 1}`,
            subject: String(args.create.subject),
            type: String(args.create.type),
            updatedAt: new Date(),
            windowStartedAt: new Date(args.create.windowStartedAt),
          };
          storedRateLimits.set(key, createdRecord);

          return Promise.resolve(createdRecord);
        }),
      },
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

          recoveryCode.usedAt = toNullableDate(args.data.usedAt);

          return Promise.resolve(recoveryCode);
        }),
      },
      refreshTokenHistory: {
        create: jest.fn((args: Prisma.RefreshTokenHistoryCreateArgs) => {
          const record: AuthRefreshTokenHistoryRecord = {
            consumedAt: new Date(args.data.consumedAt),
            expiresAt: new Date(args.data.expiresAt),
            id: `refresh-history-${storedRefreshTokenHistory.length + 1}`,
            sessionId: String(args.data.sessionId),
            tokenHash: String(args.data.tokenHash),
          };
          storedRefreshTokenHistory.push(record);
          return Promise.resolve(applySelect(record, args.select));
        }),
        deleteMany: jest.fn(
          (args: Prisma.RefreshTokenHistoryDeleteManyArgs) => {
            const expiresAt = args.where?.expiresAt;
            const cutoff =
              typeof expiresAt === 'object' &&
              expiresAt != null &&
              'lte' in expiresAt
                ? new Date(expiresAt.lte as Date)
                : null;
            const retained = storedRefreshTokenHistory.filter(
              (record) => cutoff == null || record.expiresAt > cutoff,
            );
            const count = storedRefreshTokenHistory.length - retained.length;
            storedRefreshTokenHistory = retained;
            return Promise.resolve({ count });
          },
        ),
        findUnique: jest.fn(
          (args: Prisma.RefreshTokenHistoryFindUniqueArgs) => {
            const record = storedRefreshTokenHistory.find(
              (candidate) => candidate.tokenHash === args.where.tokenHash,
            );
            if (record == null) {
              return Promise.resolve(null);
            }
            const session = storedSessions.find(
              (candidate) => candidate.id === record.sessionId,
            );
            return Promise.resolve(
              applySelect(
                {
                  ...record,
                  session:
                    session == null ? null : enrichSessionRecord(session),
                },
                args.select,
              ),
            );
          },
        ),
      },
      session: {
        create: jest.fn((args: Prisma.SessionCreateArgs) => {
          const sessionRecord: AuthSessionRecord = {
            createdAt: new Date(),
            expiresAt: new Date(args.data.expiresAt),
            id: `session-${storedSessions.length + 1}`,
            lastUsedAt: new Date(args.data.lastUsedAt),
            previousRefreshTokenHash: null,
            refreshRequestId: null,
            refreshTokenHash: String(args.data.refreshTokenHash),
            refreshTokenRotatedAt: null,
            revokedAt: null,
            rotatedRefreshTokenEncrypted: null,
            userId: String(args.data.userId),
          };
          storedSessions.push(sessionRecord);

          return Promise.resolve(
            applySelect(enrichSessionRecord(sessionRecord), args.select),
          );
        }),
        findUnique: jest.fn((args: Prisma.SessionFindUniqueArgs) => {
          const session =
            typeof args.where.id === 'string'
              ? storedSessions.find((record) => record.id === args.where.id)
              : typeof args.where.refreshTokenHash === 'string'
                ? storedSessions.find(
                    (record) =>
                      record.refreshTokenHash === args.where.refreshTokenHash,
                  )
                : storedSessions.find(
                    (record) =>
                      record.previousRefreshTokenHash ===
                      args.where.previousRefreshTokenHash,
                  );

          return Promise.resolve(
            session == null
              ? null
              : applySelect(enrichSessionRecord(session), args.select),
          );
        }),
        update: jest.fn((args: Prisma.SessionUpdateArgs) => {
          const session = storedSessions.find(
            (record) => record.id === args.where.id,
          );

          if (session == null) {
            throw new Error('session not found');
          }

          if (args.data.lastUsedAt != null) {
            session.lastUsedAt = new Date(args.data.lastUsedAt as Date);
          }
          if (typeof args.data.refreshTokenHash === 'string') {
            session.refreshTokenHash = args.data.refreshTokenHash;
          }
          if (args.data.revokedAt != null) {
            session.revokedAt = new Date(args.data.revokedAt as Date);
          }

          return Promise.resolve(
            applySelect(enrichSessionRecord(session), args.select),
          );
        }),
        updateMany: jest.fn((args: Prisma.SessionUpdateManyArgs) => {
          const idFilter = args.where?.id;
          const ids =
            typeof idFilter === 'string'
              ? [idFilter]
              : typeof idFilter === 'object' &&
                  idFilter != null &&
                  'in' in idFilter &&
                  Array.isArray(idFilter.in)
                ? idFilter.in
                : [];
          const refreshTokenHash = args.where?.refreshTokenHash;
          const expiresAt = args.where?.expiresAt;
          const expiresAfter =
            typeof expiresAt === 'object' &&
            expiresAt != null &&
            'gt' in expiresAt
              ? new Date(expiresAt.gt as Date)
              : null;
          let count = 0;
          for (const session of storedSessions) {
            const matches =
              ids.includes(session.id) &&
              (typeof args.where?.userId !== 'string' ||
                session.userId === args.where.userId) &&
              (typeof args.where?.previousRefreshTokenHash !== 'string' ||
                session.previousRefreshTokenHash ===
                  args.where.previousRefreshTokenHash) &&
              (typeof args.where?.refreshRequestId !== 'string' ||
                session.refreshRequestId === args.where.refreshRequestId) &&
              (typeof refreshTokenHash !== 'string' ||
                session.refreshTokenHash === refreshTokenHash) &&
              (args.where?.refreshTokenRotatedAt == null ||
                session.refreshTokenRotatedAt?.getTime() ===
                  new Date(
                    args.where.refreshTokenRotatedAt as Date,
                  ).getTime()) &&
              (args.where?.revokedAt !== null || session.revokedAt == null) &&
              (expiresAfter == null || session.expiresAt > expiresAfter);
            if (!matches) {
              continue;
            }

            if (args.data.lastUsedAt != null) {
              session.lastUsedAt = new Date(args.data.lastUsedAt as Date);
            }
            if (typeof args.data.previousRefreshTokenHash === 'string') {
              session.previousRefreshTokenHash =
                args.data.previousRefreshTokenHash;
            }
            if (
              typeof args.data.refreshRequestId === 'string' ||
              args.data.refreshRequestId === null
            ) {
              session.refreshRequestId = args.data.refreshRequestId;
            }
            if (typeof args.data.refreshTokenHash === 'string') {
              session.refreshTokenHash = args.data.refreshTokenHash;
            }
            if (args.data.refreshTokenRotatedAt != null) {
              session.refreshTokenRotatedAt = new Date(
                args.data.refreshTokenRotatedAt as Date,
              );
            }
            if (typeof args.data.rotatedRefreshTokenEncrypted === 'string') {
              session.rotatedRefreshTokenEncrypted =
                args.data.rotatedRefreshTokenEncrypted;
            }
            if (args.data.revokedAt != null) {
              session.revokedAt = new Date(args.data.revokedAt as Date);
            }
            count++;
          }
          return Promise.resolve({ count });
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
        device: prismaService.device,
        recoveryCode: prismaService.recoveryCode,
        refreshTokenHistory: prismaService.refreshTokenHistory,
        remoteCommand: prismaService.remoteCommand,
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

  it('/health (GET)', async () => {
    await request(app.getHttpServer())
      .get('/health')
      .set('x-request-id', 'health-e2e-request')
      .expect('x-request-id', 'health-e2e-request')
      .expect(200)
      .expect({
        service: 'kestrel-cloud-api',
        status: 'ok',
      });

    expect(prismaService.$queryRaw).toHaveBeenCalledTimes(1);
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
        nextStep: 'login',
        user: {
          createdAt: createdAt.toISOString(),
          id: 'user-1',
          username: 'alice',
        },
      });
  });

  it('/auth/totp/setup + /auth/totp/verify + /auth/login + /auth/refresh + /auth/session/revoke (POST)', async () => {
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
      .set('User-Agent', 'jest-e2e')
      .send({
        password,
        totpCode,
        username: 'alice',
      })
      .expect(201);
    const loginBody = loginResponse.body as TotpLoginResponse;

    expect(loginBody.accessToken).toMatch(/^v1\./);
    expect(loginBody.accessTokenExpiresAt).toBe('2026-05-09T15:48:00.000Z');
    expect(loginBody.authMethod).toBe('totp');
    expect(loginBody.refreshToken).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(loginBody.session.id).toBe('session-1');
    expect(loginBody.user).toEqual({
      id: 'user-1',
      username: 'alice',
    });

    const originalRefreshToken = loginBody.refreshToken;
    const refreshRequestId = 'e2e-refresh-request';
    const refreshResponse = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({
        refreshRequestId,
        refreshToken: originalRefreshToken,
      })
      .expect(201);
    const refreshBody = refreshResponse.body as TotpLoginResponse;

    expect(refreshBody.accessToken).toMatch(/^v1\./);
    expect(refreshBody.refreshToken).not.toBe(originalRefreshToken);
    expect(refreshBody.session.id).toBe('session-1');
    expect(refreshBody.session.lastUsedAt).toBe('2026-05-09T15:33:00.000Z');

    const retryResponse = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({
        refreshRequestId,
        refreshToken: originalRefreshToken,
      })
      .expect(201);
    const retryBody = retryResponse.body as TotpLoginResponse;

    expect(retryBody.refreshToken).toBe(refreshBody.refreshToken);
    expect(retryBody.session.id).toBe('session-1');

    const revokeResponse = await request(app.getHttpServer())
      .post('/auth/session/revoke')
      .set('Authorization', `Bearer ${refreshBody.accessToken}`)
      .expect(201);

    expect(revokeResponse.body).toEqual({
      session: {
        id: 'session-1',
        revokedAt: '2026-05-09T15:33:00.000Z',
      },
    });

    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({
        refreshRequestId: 'e2e-revoked-refresh-request',
        refreshToken: refreshBody.refreshToken,
      })
      .expect(401);

    expect(storedSessions).toHaveLength(1);
    expect(storedSessions[0]?.revokedAt?.toISOString()).toBe(
      '2026-05-09T15:33:00.000Z',
    );
    expect(
      storedAuditLogs.map((record) => ({
        event: record.event,
        outcome: record.outcome,
      })),
    ).toEqual([
      { event: 'login', outcome: 'success' },
      { event: 'refresh', outcome: 'success' },
      { event: 'refresh', outcome: 'success' },
      { event: 'session_revoke', outcome: 'success' },
      { event: 'refresh', outcome: 'failure' },
    ]);
  });

  it('/auth/login (POST) rate limits repeated invalid passwords', async () => {
    const passwordHash = await hash('a-very-secure-password', {
      type: argon2id,
    });

    storedUsers.set('alice', {
      createdAt: new Date('2026-05-09T00:00:00.000Z'),
      id: 'user-1',
      passwordHash,
      totpEnabledAt: null,
      totpSecretEncrypted: null,
      username: 'alice',
    });
    storedUsersById.set('user-1', storedUsers.get('alice') as AuthUserRecord);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          password: 'definitely-the-wrong-password',
          totpCode: '123456',
          username: 'alice',
        })
        .expect(401);
    }

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        password: 'definitely-the-wrong-password',
        totpCode: '123456',
        username: 'alice',
      })
      .expect(429);

    expect(
      storedRateLimits.get(getRateLimitKey('password', 'alice')),
    ).toMatchObject({
      attempts: 5,
    });
    expect(
      storedAuditLogs.filter((record) => record.event === 'login'),
    ).toHaveLength(6);
  });

  afterEach(async () => {
    jest.useRealTimers();
    await app.close();
    delete process.env.AUTH_ACCESS_TOKEN_SECRET;
    delete process.env.AUTH_ACCESS_TOKEN_TTL_SECONDS;
    delete process.env.AUTH_TOTP_ENCRYPTION_KEY;
    delete process.env.AUTH_TOTP_ISSUER;
  });

  function enrichSessionRecord(
    record: AuthSessionRecord,
  ): AuthSessionRecord & { user: AuthUserRecord | null } {
    return {
      ...record,
      user: storedUsersById.get(record.userId) ?? null,
    };
  }
});

function applySelect(
  record: Record<string, unknown>,
  select:
    | Record<string, boolean | { select: Record<string, boolean> }>
    | null
    | undefined,
): Record<string, unknown> {
  if (select == null) {
    return { ...record };
  }

  return Object.fromEntries(
    Object.entries(select).flatMap(([key, value]) => {
      if (value === true) {
        return [[key, record[key] ?? null]];
      }

      if (
        value != null &&
        typeof value === 'object' &&
        'select' in value &&
        record[key] != null &&
        typeof record[key] === 'object'
      ) {
        return [
          [
            key,
            applySelect(record[key] as Record<string, unknown>, value.select),
          ],
        ];
      }

      return [];
    }),
  );
}

function getRateLimitKey(type: string, subject: string): string {
  return `${type}:${subject}`;
}

function toNullableDate(value: Date | string | null | undefined): Date | null {
  if (value == null) {
    return null;
  }

  return new Date(value);
}

function toNullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}
