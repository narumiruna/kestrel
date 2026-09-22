/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/require-await */
import { createHash } from 'node:crypto';
import { AndroidLoginService } from './android-login.service';

const NOW = new Date('2026-09-23T12:00:00.000Z');
const ATTEMPT_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const WEB_SESSION_ID = '33333333-3333-4333-8333-333333333333';
const QR_SECRET = Buffer.alloc(32, 7).toString('base64url');
const VERIFIER = Buffer.alloc(32, 8).toString('base64url');
const CHALLENGE = createHash('sha256').update(VERIFIER).digest('base64url');
const CONFIG_SECRET = Buffer.alloc(32, 9).toString('base64');

function attempt(overrides: Record<string, unknown> = {}) {
  return {
    approvedAt: null,
    appVersion: '1.0.0',
    authorizingSession: {
      expiresAt: new Date(NOW.getTime() + 60_000),
      revokedAt: null,
    },
    authorizingSessionId: WEB_SESSION_ID,
    claimedAt: NOW,
    consumedAt: null,
    deniedAt: null,
    deviceName: 'Pixel Test',
    exchangeSessionId: null,
    expiresAt: new Date(NOW.getTime() + 60_000),
    id: ATTEMPT_ID,
    lastPolledAt: null,
    qrSecretHash: sha256(QR_SECRET),
    user: { id: USER_ID, username: 'alice' },
    userId: USER_ID,
    verifierChallenge: CHALLENGE,
    ...overrides,
  };
}

describe('AndroidLoginService', () => {
  let accessTokenService: { issueToken: jest.Mock };
  let auditService: { log: jest.Mock };
  let prisma: ReturnType<typeof createPrismaMock>;
  let service: AndroidLoginService;
  let totpService: { decryptSecret: jest.Mock };

  beforeEach(() => {
    jest.useFakeTimers({
      doNotFake: ['nextTick', 'setImmediate', 'setTimeout'],
    });
    jest.setSystemTime(NOW);
    process.env.NODE_ENV = 'test';
    process.env.KESTREL_PUBLIC_URL = 'https://kestrel.example.test';
    process.env.AUTH_ANDROID_QR_LOGIN_SECRET = CONFIG_SECRET;
    accessTokenService = {
      issueToken: jest.fn().mockReturnValue({
        expiresAt: new Date(NOW.getTime() + 900_000),
        token: 'access-token',
      }),
    };
    auditService = { log: jest.fn().mockResolvedValue(undefined) };
    prisma = createPrismaMock();
    totpService = { decryptSecret: jest.fn() };
    service = new AndroidLoginService(
      accessTokenService as never,
      auditService as never,
      { get: (key: string) => process.env[key] } as never,
      prisma as never,
      totpService as never,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
    delete process.env.AUTH_ANDROID_QR_LOGIN_SECRET;
    delete process.env.KESTREL_PUBLIC_URL;
  });

  it('reports disabled for missing or invalid optional configuration', () => {
    delete process.env.AUTH_ANDROID_QR_LOGIN_SECRET;
    expect(service.getMethod()).toEqual({ enabled: false });

    process.env.AUTH_ANDROID_QR_LOGIN_SECRET = 'short';
    expect(service.getMethod()).toEqual({ enabled: false });
  });

  it('creates a short-lived attempt only from a recent Web session', async () => {
    prisma.tx.session.findFirst.mockResolvedValue({
      createdAt: new Date(NOW.getTime() - 60_000),
    });

    const response = await service.createAttempt(USER_ID, WEB_SESSION_ID);

    expect(response.attemptId).toMatch(/^[0-9a-f-]{36}$/);
    expect(response.expiresAt).toEqual(new Date(NOW.getTime() + 5 * 60_000));
    expect(response.qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);
    expect(prisma.tx.androidLoginAttempt.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        authorizingSessionId: WEB_SESSION_ID,
        expiresAt: response.expiresAt,
        id: response.attemptId,
        qrSecretHash: expect.stringMatching(/^[0-9a-f]{64}$/),
        userId: USER_ID,
      }),
    });
    expect(prisma.tx.androidLoginAttempt.updateMany).toHaveBeenCalledWith({
      data: { approvedAt: null, deniedAt: NOW },
      where: expect.objectContaining({
        authorizingSessionId: WEB_SESSION_ID,
        consumedAt: null,
      }),
    });
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'android_qr_create',
        outcome: 'success',
      }),
    );
  });

  it('requires normal reauthentication for a stale Web session', async () => {
    prisma.tx.session.findFirst.mockResolvedValue({
      createdAt: new Date(NOW.getTime() - 10 * 60_000 - 1),
    });

    await expect(
      service.createAttempt(USER_ID, WEB_SESSION_ID),
    ).rejects.toMatchObject({
      message: expect.stringContaining('Sign in again'),
    });
    expect(prisma.tx.androidLoginAttempt.create).not.toHaveBeenCalled();
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        failureReason: 'reauthentication_required',
        outcome: 'failure',
      }),
    );
  });

  it('rejects creation when the active-attempt storage cap is reached', async () => {
    prisma.tx.session.findFirst.mockResolvedValue({
      createdAt: new Date(NOW.getTime() - 60_000),
    });
    prisma.tx.androidLoginAttempt.count.mockResolvedValue(1000);

    await expect(
      service.createAttempt(USER_ID, WEB_SESSION_ID),
    ).rejects.toMatchObject({
      message: expect.stringContaining('temporarily unavailable'),
    });
    expect(prisma.tx.androidLoginAttempt.create).not.toHaveBeenCalled();
  });

  it('claims idempotently for one verifier challenge and rejects replacement', async () => {
    prisma.androidLoginAttempt.findUnique
      .mockResolvedValueOnce(
        attempt({ claimedAt: null, verifierChallenge: null }),
      )
      .mockResolvedValueOnce(attempt());

    const response = await service.claimAttempt({
      appVersion: '1.0.0',
      attemptId: ATTEMPT_ID,
      deviceName: 'Pixel Test',
      qrSecret: QR_SECRET,
      verifierChallenge: CHALLENGE,
    });

    expect(response).toMatchObject({
      attemptId: ATTEMPT_ID,
      matchingCode: expect.stringMatching(/^\d{3}-\d{3}$/),
      serverOrigin: 'https://kestrel.example.test',
      user: { username: 'alice' },
    });
    expect(prisma.androidLoginAttempt.updateMany).toHaveBeenCalledWith({
      data: expect.objectContaining({
        claimedAt: NOW,
        verifierChallenge: CHALLENGE,
      }),
      where: expect.objectContaining({ id: ATTEMPT_ID }),
    });

    prisma.androidLoginAttempt.findUnique.mockResolvedValue(
      attempt({ verifierChallenge: Buffer.alloc(32, 6).toString('base64url') }),
    );
    await expect(
      service.claimAttempt({
        attemptId: ATTEMPT_ID,
        deviceName: 'Other device',
        qrSecret: QR_SECRET,
        verifierChallenge: CHALLENGE,
      }),
    ).rejects.toMatchObject({
      message: expect.stringContaining('another device'),
    });
  });

  it('moves an approved attempt to denied without violating terminal-state constraints', async () => {
    prisma.androidLoginAttempt.findFirst
      .mockResolvedValueOnce(attempt({ approvedAt: NOW }))
      .mockResolvedValueOnce(attempt({ approvedAt: null, deniedAt: NOW }));

    await expect(
      service.denyAttempt(USER_ID, WEB_SESSION_ID, ATTEMPT_ID),
    ).resolves.toMatchObject({ status: 'denied' });
    expect(prisma.androidLoginAttempt.updateMany).toHaveBeenCalledWith({
      data: { approvedAt: null, deniedAt: NOW },
      where: expect.objectContaining({
        consumedAt: null,
        deniedAt: null,
        id: ATTEMPT_ID,
      }),
    });
  });

  it('requires a claim before same-session approval', async () => {
    prisma.androidLoginAttempt.updateMany.mockResolvedValue({ count: 0 });
    prisma.androidLoginAttempt.findFirst.mockResolvedValue(
      attempt({ claimedAt: null, verifierChallenge: null }),
    );

    await expect(
      service.approveAttempt(USER_ID, WEB_SESSION_ID, ATTEMPT_ID),
    ).rejects.toMatchObject({
      message: expect.stringContaining('not been claimed'),
    });
  });

  it('returns pending and enforces the minimum polling interval', async () => {
    prisma.androidLoginAttempt.findUnique.mockResolvedValue(attempt());
    prisma.androidLoginAttempt.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    await expect(
      service.exchangeAttempt({
        attemptId: ATTEMPT_ID,
        qrSecret: QR_SECRET,
        verifier: VERIFIER,
      }),
    ).resolves.toEqual({ retryAfterSeconds: 5, status: 'pending' });
    await expect(
      service.exchangeAttempt({
        attemptId: ATTEMPT_ID,
        qrSecret: QR_SECRET,
        verifier: VERIFIER,
      }),
    ).resolves.toEqual({ retryAfterSeconds: 5, status: 'slow_down' });
  });

  it('atomically creates an independent Android session after approval', async () => {
    const approvedAttempt = attempt({ approvedAt: NOW });
    prisma.androidLoginAttempt.findUnique.mockResolvedValue(approvedAttempt);
    prisma.androidLoginAttempt.updateMany.mockResolvedValue({ count: 1 });
    prisma.tx.session.findFirst.mockResolvedValue({ id: WEB_SESSION_ID });
    prisma.tx.session.create.mockResolvedValue({
      createdAt: NOW,
      expiresAt: new Date(NOW.getTime() + 30 * 24 * 60 * 60_000),
      id: '44444444-4444-4444-8444-444444444444',
      lastUsedAt: NOW,
    });
    prisma.tx.androidLoginAttempt.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.exchangeAttempt({
      attemptId: ATTEMPT_ID,
      qrSecret: QR_SECRET,
      verifier: VERIFIER,
    });

    expect(result).toMatchObject({
      session: {
        accessToken: 'access-token',
        authMethod: 'android_qr',
        refreshToken: expect.any(String),
        user: { id: USER_ID, username: 'alice' },
      },
      status: 'complete',
    });
    expect(prisma.tx.session.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: expect.any(String),
        refreshTokenHash: expect.stringMatching(/^[0-9a-f]{64}$/),
        userId: USER_ID,
      }),
      select: expect.any(Object),
    });
    expect(prisma.tx.androidLoginAttempt.updateMany).toHaveBeenCalledWith({
      data: expect.objectContaining({
        consumedAt: NOW,
        exchangeSessionId: expect.any(String),
      }),
      where: expect.objectContaining({
        approvedAt: { not: null },
        verifierChallenge: CHALLENGE,
      }),
    });
  });

  it('recovers the same consumed session and its rotated refresh successor', async () => {
    prisma.androidLoginAttempt.findUnique.mockResolvedValue(
      attempt({
        approvedAt: NOW,
        consumedAt: NOW,
        exchangeSessionId: '44444444-4444-4444-8444-444444444444',
        expiresAt: new Date(NOW.getTime() + 60_000),
      }),
    );
    totpService.decryptSecret.mockReturnValue('rotated-refresh-token');
    prisma.session.findUnique.mockResolvedValue({
      createdAt: NOW,
      expiresAt: new Date(NOW.getTime() + 60_000),
      id: '44444444-4444-4444-8444-444444444444',
      lastUsedAt: NOW,
      refreshTokenHash: sha256('rotated-refresh-token'),
      revokedAt: null,
      rotatedRefreshTokenEncrypted: 'encrypted-successor',
      user: { id: USER_ID, username: 'alice' },
    });

    const result = await service.exchangeAttempt({
      attemptId: ATTEMPT_ID,
      qrSecret: QR_SECRET,
      verifier: VERIFIER,
    });

    expect(result).toMatchObject({
      session: {
        refreshToken: 'rotated-refresh-token',
        session: { id: '44444444-4444-4444-8444-444444444444' },
      },
      status: 'complete',
    });
    expect(prisma.tx.session.create).not.toHaveBeenCalled();
  });

  it('fails closed for a wrong QR secret, verifier, denial, or expiry', async () => {
    prisma.androidLoginAttempt.findUnique.mockResolvedValue(attempt());
    await expect(
      service.exchangeAttempt({
        attemptId: ATTEMPT_ID,
        qrSecret: Buffer.alloc(32, 1).toString('base64url'),
        verifier: VERIFIER,
      }),
    ).rejects.toMatchObject({ message: expect.stringContaining('invalid') });

    prisma.androidLoginAttempt.findUnique.mockResolvedValue(attempt());
    await expect(
      service.exchangeAttempt({
        attemptId: ATTEMPT_ID,
        qrSecret: QR_SECRET,
        verifier: Buffer.alloc(32, 2).toString('base64url'),
      }),
    ).rejects.toMatchObject({ message: expect.stringContaining('invalid') });

    prisma.androidLoginAttempt.findUnique.mockResolvedValue(
      attempt({ deniedAt: NOW }),
    );
    await expect(
      service.exchangeAttempt({
        attemptId: ATTEMPT_ID,
        qrSecret: QR_SECRET,
        verifier: VERIFIER,
      }),
    ).rejects.toMatchObject({ message: expect.stringContaining('denied') });

    auditService.log.mockClear();
    prisma.androidLoginAttempt.findUnique.mockResolvedValue(
      attempt({ expiresAt: new Date(NOW.getTime() - 1) }),
    );
    await expect(
      service.exchangeAttempt({
        attemptId: ATTEMPT_ID,
        qrSecret: QR_SECRET,
        verifier: VERIFIER,
      }),
    ).rejects.toMatchObject({ message: expect.stringContaining('expired') });
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'android_qr_expire',
        failureReason: 'attempt_expired',
        outcome: 'failure',
      }),
    );
  });
});

function createPrismaMock() {
  const tx = {
    androidLoginAttempt: {
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    session: {
      create: jest.fn(),
      findFirst: jest.fn(),
    },
  };
  return {
    androidLoginAttempt: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    session: { findUnique: jest.fn() },
    tx,
    $transaction: jest.fn(async (callback: (store: typeof tx) => unknown) =>
      callback(tx),
    ),
  };
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
