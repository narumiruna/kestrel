/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/require-await -- in-memory Prisma and Supertest values intentionally mirror runtime APIs */
import { createHash } from 'node:crypto';
import { createAdaptorServer } from '@hono/node-server';
import request from 'supertest';
import { createApp } from '../src/app';
import { type Container, createContainer } from '../src/container';
import { PrismaService } from '../src/prisma/prisma.service';

jest.mock('qrcode', () => ({
  __esModule: true,
  default: {
    toDataURL: jest.fn(
      async (value: string) =>
        `data:image/png;base64,${Buffer.from(value).toString('base64')}`,
    ),
  },
}));

const NOW = new Date('2026-09-23T12:00:00.000Z');
const USER_ID = '11111111-1111-4111-8111-111111111111';
const WEB_SESSION_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_SESSION_ID = '33333333-3333-4333-8333-333333333333';
const CONFIG_SECRET = Buffer.alloc(32, 5).toString('base64');

type StoredSession = {
  createdAt: Date;
  expiresAt: Date;
  id: string;
  ipAddress: string | null;
  lastUsedAt: Date;
  refreshTokenHash: string;
  revokedAt: Date | null;
  rotatedRefreshTokenEncrypted: string | null;
  userAgent: string | null;
  userId: string;
};

type StoredAttempt = {
  approvedAt: Date | null;
  appVersion: string | null;
  authorizingSessionId: string;
  claimedAt: Date | null;
  consumedAt: Date | null;
  createdAt: Date;
  deniedAt: Date | null;
  deviceName: string | null;
  exchangeSessionId: string | null;
  expiresAt: Date;
  id: string;
  lastPolledAt: Date | null;
  qrSecretHash: string;
  userId: string;
  verifierChallenge: string | null;
};

class FakeAndroidLoginPrisma {
  readonly attempts: StoredAttempt[] = [];
  readonly sessions: StoredSession[] = [
    createSession(WEB_SESSION_ID, 'Kestrel Web'),
    createSession(OTHER_SESSION_ID, 'Other browser'),
  ];
  readonly audits: Array<Record<string, unknown>> = [];
  private transactionTail = Promise.resolve();

  readonly androidLoginAttempt = {
    count: async (args: { where?: Record<string, unknown> }) =>
      this.attempts.filter((item) => this.matchesAttempt(item, args.where))
        .length,
    create: async (args: { data: Record<string, unknown> }) => {
      const item: StoredAttempt = {
        approvedAt: null,
        appVersion: null,
        authorizingSessionId: String(args.data.authorizingSessionId),
        claimedAt: null,
        consumedAt: null,
        createdAt: NOW,
        deniedAt: null,
        deviceName: null,
        exchangeSessionId: null,
        expiresAt: new Date(args.data.expiresAt as Date),
        id: String(args.data.id),
        lastPolledAt: null,
        qrSecretHash: String(args.data.qrSecretHash),
        userId: String(args.data.userId),
        verifierChallenge: null,
      };
      this.attempts.push(item);
      return item;
    },
    deleteMany: async (args: { where?: Record<string, unknown> }) => {
      const retained = this.attempts.filter(
        (item) => !this.matchesAttempt(item, args.where),
      );
      const count = this.attempts.length - retained.length;
      this.attempts.splice(0, this.attempts.length, ...retained);
      return { count };
    },
    findFirst: async (args: { where?: Record<string, unknown> }) => {
      const item = this.attempts.find((candidate) =>
        this.matchesAttempt(candidate, args.where),
      );
      return item == null ? null : this.enrichAttempt(item);
    },
    findMany: async (args: {
      take?: number;
      where?: Record<string, unknown>;
    }) =>
      this.attempts
        .filter((candidate) => this.matchesAttempt(candidate, args.where))
        .sort(
          (left, right) => left.expiresAt.getTime() - right.expiresAt.getTime(),
        )
        .slice(0, args.take),
    findUnique: async (args: { where: { id?: string } }) => {
      const item = this.attempts.find(
        (candidate) => candidate.id === args.where.id,
      );
      return item == null ? null : this.enrichAttempt(item);
    },
    updateMany: async (args: {
      data: Partial<StoredAttempt>;
      where?: Record<string, unknown>;
    }) => {
      const matching = this.attempts.filter((item) =>
        this.matchesAttempt(item, args.where),
      );
      for (const item of matching) {
        Object.assign(item, args.data);
      }
      return { count: matching.length };
    },
  };

  readonly authAuditLog = {
    create: async (args: { data: Record<string, unknown> }) => {
      const record = {
        createdAt: NOW,
        id: `audit-${this.audits.length}`,
        ...args.data,
      };
      this.audits.push(record);
      return record;
    },
  };

  readonly session = {
    create: async (args: { data: Record<string, unknown> }) => {
      const refreshTokenHash = String(args.data.refreshTokenHash);
      if (
        this.sessions.some(
          (candidate) => candidate.refreshTokenHash === refreshTokenHash,
        )
      ) {
        throw new Error('duplicate refresh token hash');
      }
      const session: StoredSession = {
        createdAt: NOW,
        expiresAt: new Date(args.data.expiresAt as Date),
        id: String(args.data.id),
        ipAddress:
          typeof args.data.ipAddress === 'string' ? args.data.ipAddress : null,
        lastUsedAt: new Date(args.data.lastUsedAt as Date),
        refreshTokenHash,
        revokedAt: null,
        rotatedRefreshTokenEncrypted: null,
        userAgent:
          typeof args.data.userAgent === 'string' ? args.data.userAgent : null,
        userId: String(args.data.userId),
      };
      this.sessions.push(session);
      return session;
    },
    findFirst: async (args: { where?: Record<string, unknown> }) =>
      this.sessions.find((item) => matchesSession(item, args.where)) ?? null,
    findMany: async (args: { where?: Record<string, unknown> }) =>
      this.sessions.filter((item) => matchesSession(item, args.where)),
    findUnique: async (args: {
      where: { id?: string; refreshTokenHash?: string };
    }) => {
      const session = this.sessions.find(
        (item) =>
          item.id === args.where.id ||
          item.refreshTokenHash === args.where.refreshTokenHash,
      );
      return session == null ? null : this.enrichSession(session);
    },
    updateMany: async (args: {
      data: Partial<StoredSession>;
      where?: Record<string, unknown>;
    }) => {
      const matching = this.sessions.filter((item) =>
        matchesSession(item, args.where),
      );
      for (const item of matching) {
        Object.assign(item, args.data);
      }
      return { count: matching.length };
    },
  };

  readonly device = {
    findMany: async () => [],
    updateMany: async () => ({ count: 0 }),
  };

  readonly remoteCommand = {
    updateMany: async () => ({ count: 0 }),
  };

  readonly place = { findMany: async () => [] };
  readonly route = { findMany: async () => [] };
  readonly libraryItem = { findMany: async () => [] };
  readonly syncEvent = {
    findFirst: async () => null,
  };

  async $transaction<T>(callback: (tx: this) => Promise<T>): Promise<T> {
    let release: () => void = () => undefined;
    const previous = this.transactionTail;
    this.transactionTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    const attemptSnapshot = structuredClone(this.attempts);
    const sessionSnapshot = structuredClone(this.sessions);
    try {
      return await callback(this);
    } catch (error) {
      this.attempts.splice(0, this.attempts.length, ...attemptSnapshot);
      this.sessions.splice(0, this.sessions.length, ...sessionSnapshot);
      throw error;
    } finally {
      release();
    }
  }

  private enrichAttempt(item: StoredAttempt) {
    const authorizingSession = this.sessions.find(
      (candidate) => candidate.id === item.authorizingSessionId,
    );
    return {
      ...item,
      authorizingSession:
        authorizingSession == null
          ? null
          : {
              expiresAt: authorizingSession.expiresAt,
              revokedAt: authorizingSession.revokedAt,
            },
      user: { id: USER_ID, username: 'alice' },
    };
  }

  private enrichSession(item: StoredSession) {
    return {
      ...item,
      user: { id: USER_ID, username: 'alice' },
    };
  }

  private matchesAttempt(
    item: StoredAttempt,
    where: Record<string, unknown> | undefined,
  ): boolean {
    if (where == null) return true;
    if (!matchesScalar(item.id, where.id)) return false;
    if (!matchesScalar(item.userId, where.userId)) return false;
    if (!matchesScalar(item.authorizingSessionId, where.authorizingSessionId)) {
      return false;
    }
    if (!matchesNullable(item.claimedAt, where.claimedAt)) return false;
    if (!matchesNullable(item.approvedAt, where.approvedAt)) return false;
    if (!matchesNullable(item.consumedAt, where.consumedAt)) return false;
    if (!matchesNullable(item.deniedAt, where.deniedAt)) return false;
    if (!matchesNullable(item.verifierChallenge, where.verifierChallenge)) {
      return false;
    }
    if (!matchesDate(item.expiresAt, where.expiresAt)) return false;
    if (where.OR != null && Array.isArray(where.OR)) {
      const matchesAny = where.OR.some((condition) =>
        this.matchesAttempt(item, condition as Record<string, unknown>),
      );
      if (!matchesAny) return false;
    }
    const authorizingWhere = where.authorizingSession;
    if (
      authorizingWhere != null &&
      typeof authorizingWhere === 'object' &&
      !matchesSession(
        this.sessions.find(
          (candidate) => candidate.id === item.authorizingSessionId,
        ),
        authorizingWhere as Record<string, unknown>,
      )
    ) {
      return false;
    }
    if (!matchesDate(item.lastPolledAt, where.lastPolledAt)) return false;
    return true;
  }
}

describe('Android QR login flow (e2e)', () => {
  let container: Container;
  let prisma: FakeAndroidLoginPrisma;
  let server: ReturnType<typeof createAdaptorServer>;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
    process.env.NODE_ENV = 'test';
    process.env.AUTH_ACCESS_TOKEN_SECRET = 'android-login-e2e-access-secret';
    process.env.AUTH_ANDROID_QR_LOGIN_SECRET = CONFIG_SECRET;
    process.env.AUTH_TOTP_ENCRYPTION_KEY = CONFIG_SECRET;
    process.env.KESTREL_PUBLIC_URL = 'https://kestrel.example.test';
    prisma = new FakeAndroidLoginPrisma();
    container = createContainer({
      prismaService: prisma as unknown as PrismaService,
    });
    server = createAdaptorServer(createApp(container));
  });

  afterEach(() => {
    jest.useRealTimers();
    server.close();
    delete process.env.AUTH_ACCESS_TOKEN_SECRET;
    delete process.env.AUTH_ANDROID_QR_LOGIN_SECRET;
    delete process.env.AUTH_TOTP_ENCRYPTION_KEY;
    delete process.env.KESTREL_PUBLIC_URL;
  });

  it('creates, claims, approves, retries, authorizes sync, lists, and revokes one Android session', async () => {
    const webToken = issueToken(container, WEB_SESSION_ID);
    const createResponse = await request(server)
      .post('/auth/android-login-attempts')
      .set('Authorization', `Bearer ${webToken}`)
      .send({})
      .expect('Cache-Control', 'no-store')
      .expect(201);
    const qrPayload = decodeQrPayload(
      createResponse.body.qrCodeDataUrl as string,
    );
    expect(qrPayload.search).toBe('');
    expect(qrPayload.pathname).toBe('/login/android');
    const attemptId = requiredFragment(qrPayload, 'attempt');
    const qrSecret = requiredFragment(qrPayload, 'secret');
    expect(prisma.attempts[0]).toMatchObject({
      qrSecretHash: sha256(qrSecret),
    });
    expect(JSON.stringify(prisma.attempts)).not.toContain(qrSecret);

    const verifier = Buffer.alloc(32, 8).toString('base64url');
    const verifierChallenge = createHash('sha256')
      .update(verifier)
      .digest('base64url');
    const claimResponse = await request(server)
      .post(`/auth/android-login-attempts/${attemptId}/claim`)
      .send({
        appVersion: '1.0.0',
        deviceName: 'Pixel Test',
        qrSecret,
        verifierChallenge,
      })
      .expect(201);
    const matchingCode = claimResponse.body.matchingCode as string;

    const webStatus = await request(server)
      .get(`/auth/android-login-attempts/${attemptId}`)
      .set('Authorization', `Bearer ${webToken}`)
      .expect(200);
    expect(webStatus.body).toMatchObject({
      device: { appVersion: '1.0.0', name: 'Pixel Test' },
      matchingCode,
      status: 'claimed',
    });

    await request(server)
      .post(`/auth/android-login-attempts/${attemptId}/exchange`)
      .send({ qrSecret, verifier })
      .expect('Retry-After', '5')
      .expect(202);
    await request(server)
      .post(`/auth/android-login-attempts/${attemptId}/approve`)
      .set('Authorization', `Bearer ${webToken}`)
      .send({})
      .expect(201);
    jest.advanceTimersByTime(5000);

    const [firstExchange, concurrentRetry] = await Promise.all([
      request(server)
        .post(`/auth/android-login-attempts/${attemptId}/exchange`)
        .send({ qrSecret, verifier }),
      request(server)
        .post(`/auth/android-login-attempts/${attemptId}/exchange`)
        .send({ qrSecret, verifier }),
    ]);
    expect(firstExchange.status).toBe(201);
    expect(concurrentRetry.status).toBe(201);
    expect(firstExchange.body.session.id).toBe(concurrentRetry.body.session.id);
    expect(firstExchange.body.refreshToken).toBe(
      concurrentRetry.body.refreshToken,
    );
    expect(
      prisma.sessions.filter(
        (item) => item.id === firstExchange.body.session.id,
      ),
    ).toHaveLength(1);

    const androidToken = firstExchange.body.accessToken as string;
    const syncResponse = await request(server)
      .get('/sync/bootstrap')
      .set('Authorization', `Bearer ${androidToken}`)
      .expect(200);
    expect(syncResponse.body).toMatchObject({
      libraryItems: [],
      places: [],
      routes: [],
    });

    const sessionsResponse = await request(server)
      .get('/auth/sessions')
      .set('Authorization', `Bearer ${webToken}`)
      .expect(200);
    expect(sessionsResponse.body.sessions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: firstExchange.body.session.id }),
      ]),
    );

    await request(server)
      .post(`/auth/sessions/${firstExchange.body.session.id}/revoke`)
      .set('Authorization', `Bearer ${androidToken}`)
      .send({})
      .expect(201);
    await request(server)
      .get('/sync/bootstrap')
      .set('Authorization', `Bearer ${androidToken}`)
      .expect(401);
    expect(prisma.audits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          authMethod: 'android_qr',
          event: 'android_qr_exchange',
          outcome: 'success',
        }),
      ]),
    );
  });

  it('rejects foreign approval, competing claims, denial replay, and expiry', async () => {
    const webToken = issueToken(container, WEB_SESSION_ID);
    const otherToken = issueToken(container, OTHER_SESSION_ID);
    const created = await createAttempt(server, webToken);
    const verifier = Buffer.alloc(32, 6).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');

    await request(server)
      .post(`/auth/android-login-attempts/${created.attemptId}/claim`)
      .send({
        deviceName: 'Pixel Test',
        qrSecret: created.qrSecret,
        verifierChallenge: challenge,
      })
      .expect(201);
    await request(server)
      .post(`/auth/android-login-attempts/${created.attemptId}/approve`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({})
      .expect(404);
    await request(server)
      .post(`/auth/android-login-attempts/${created.attemptId}/claim`)
      .send({
        deviceName: 'Attacker',
        qrSecret: created.qrSecret,
        verifierChallenge: createHash('sha256')
          .update(Buffer.alloc(32, 7).toString('base64url'))
          .digest('base64url'),
      })
      .expect(409);
    await request(server)
      .post(`/auth/android-login-attempts/${created.attemptId}/deny`)
      .set('Authorization', `Bearer ${webToken}`)
      .send({})
      .expect(201);
    await request(server)
      .post(`/auth/android-login-attempts/${created.attemptId}/exchange`)
      .send({ qrSecret: created.qrSecret, verifier })
      .expect(403);

    const expiring = await createAttempt(server, webToken);
    jest.advanceTimersByTime(5 * 60_000 + 1);
    await request(server)
      .post(`/auth/android-login-attempts/${expiring.attemptId}/claim`)
      .send({
        deviceName: 'Pixel Test',
        qrSecret: expiring.qrSecret,
        verifierChallenge: challenge,
      })
      .expect(410);
  });
});

async function createAttempt(
  server: ReturnType<typeof createAdaptorServer>,
  accessToken: string,
): Promise<{ attemptId: string; qrSecret: string }> {
  const response = await request(server)
    .post('/auth/android-login-attempts')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({})
    .expect(201);
  const url = decodeQrPayload(response.body.qrCodeDataUrl as string);
  return {
    attemptId: requiredFragment(url, 'attempt'),
    qrSecret: requiredFragment(url, 'secret'),
  };
}

function issueToken(container: Container, sessionId: string): string {
  return container.accessTokenService.issueToken(
    { sessionId, userId: USER_ID },
    NOW,
  ).token;
}

function createSession(id: string, userAgent: string): StoredSession {
  return {
    createdAt: new Date(NOW.getTime() - 60_000),
    expiresAt: new Date(NOW.getTime() + 60 * 60_000),
    id,
    ipAddress: null,
    lastUsedAt: NOW,
    refreshTokenHash: sha256(`refresh-${id}`),
    revokedAt: null,
    rotatedRefreshTokenEncrypted: null,
    userAgent,
    userId: USER_ID,
  };
}

function matchesSession(
  item: StoredSession | undefined,
  where: Record<string, unknown> | undefined,
): boolean {
  if (item == null) return false;
  if (where == null) return true;
  if (!matchesScalar(item.id, where.id)) return false;
  if (!matchesScalar(item.userId, where.userId)) return false;
  if (!matchesNullable(item.revokedAt, where.revokedAt)) return false;
  if (!matchesDate(item.expiresAt, where.expiresAt)) return false;
  return true;
}

function matchesScalar(value: string, condition: unknown): boolean {
  if (condition == null) return true;
  if (typeof condition === 'string') return value === condition;
  if (typeof condition !== 'object') return false;
  const record = condition as { in?: unknown; not?: unknown };
  if (Array.isArray(record.in) && !record.in.includes(value)) return false;
  if (typeof record.not === 'string' && value === record.not) return false;
  return true;
}

function matchesNullable(value: unknown, condition: unknown): boolean {
  if (condition === undefined) return true;
  if (condition === null) return value == null;
  if (typeof condition !== 'object' || condition == null) {
    return value === condition;
  }
  const record = condition as { not?: unknown };
  if (record.not === null) return value != null;
  return value === condition;
}

function matchesDate(value: Date | null, condition: unknown): boolean {
  if (condition === undefined) return true;
  if (condition === null) return value == null;
  if (value == null || typeof condition !== 'object') return false;
  const record = condition as { gt?: Date; lte?: Date };
  if (record.gt != null && value <= new Date(record.gt)) return false;
  if (record.lte != null && value > new Date(record.lte)) return false;
  return true;
}

function decodeQrPayload(dataUrl: string): URL {
  const encoded = dataUrl.slice(dataUrl.indexOf(',') + 1);
  return new URL(Buffer.from(encoded, 'base64').toString('utf8'));
}

function requiredFragment(url: URL, name: string): string {
  const value = new URLSearchParams(url.hash.slice(1)).get(name);
  if (value == null) throw new Error(`missing ${name}`);
  return value;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
