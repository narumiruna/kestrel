/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { Prisma } from '@prisma/client';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { SignJWT } from 'jose';
import { ConfigService } from '../config.service';
import {
  ConflictException,
  GoneException,
  HttpException,
} from '../http/errors';
import { PrismaService } from '../prisma/prisma.service';
import { AccessTokenService } from './access-token.service';
import { AuthAuditService } from './auth-audit.service';
import { PocketIdService } from './pocket-id.service';

const ISSUER = 'https://pocket-id.example.test';
const CLIENT_ID = 'client-id';
const CLIENT_NONCE = 'browser-attempt:1234567890abcdef';
const ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
const WEB_CALLBACK = 'https://kestrel.example.test/login/pocket-id';
const REDIRECT_URI =
  'https://kestrel.example.test/api/backend/auth/oidc/pocket-id/callback';

type PrismaMock = ReturnType<typeof createPrismaMock>;

describe('PocketIdService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('reports disabled without configuration and rejects partial configuration', async () => {
    const prisma = createPrismaMock();
    const disabled = createService(prisma, {});
    expect(disabled.getMethods()).toEqual({ pocketId: { enabled: false } });

    const partial = createService(prisma, {
      AUTH_POCKET_ID_ISSUER: ISSUER,
    });
    expect(partial.getMethods()).toEqual({ pocketId: { enabled: false } });
    await expect(
      partial.start({ clientNonce: CLIENT_NONCE, clientType: 'web' }),
    ).rejects.toThrow('Pocket ID configuration is incomplete');
  });

  it('creates a server-bound authorization request with PKCE, state, and nonce', async () => {
    const prisma = createPrismaMock();
    mockDiscovery();
    const service = createService(prisma);

    const result = await service.start({
      clientNonce: CLIENT_NONCE,
      clientType: 'web',
    });
    const authorizationUrl = new URL(result.authorizationUrl);
    const state = authorizationUrl.searchParams.get('state');
    const providerNonce = authorizationUrl.searchParams.get('nonce');

    expect(authorizationUrl.origin + authorizationUrl.pathname).toBe(
      `${ISSUER}/authorize`,
    );
    expect(authorizationUrl.searchParams.get('client_id')).toBe(CLIENT_ID);
    expect(authorizationUrl.searchParams.get('redirect_uri')).toBe(
      REDIRECT_URI,
    );
    expect(authorizationUrl.searchParams.get('response_type')).toBe('code');
    expect(authorizationUrl.searchParams.get('scope')).toBe('openid profile');
    expect(authorizationUrl.searchParams.get('code_challenge_method')).toBe(
      'S256',
    );
    expect(authorizationUrl.searchParams.get('code_challenge')).toHaveLength(
      43,
    );
    expect(state).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(state).not.toContain(CLIENT_NONCE);
    expect(providerNonce).toBe(state);
    expect(prisma.transaction.oidcLoginAttempt.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        clientType: 'web',
        provider: 'pocket_id',
        pkceVerifierEncrypted: expect.stringMatching(/^v1\./),
        sourceHash: sha256('unknown'),
        stateHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    });
    expect(
      prisma.transaction.oidcLoginAttempt.create.mock.calls[0][0].data,
    ).not.toEqual(expect.objectContaining({ state }));
  });

  it('prunes expired attempts and applies source-aware and global caps', async () => {
    const prisma = createPrismaMock();
    mockDiscovery();
    prisma.transaction.oidcLoginAttempt.count
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(1_000);
    const service = createService(prisma);

    let rejected: unknown;
    try {
      await service.start(
        {
          clientNonce: CLIENT_NONCE,
          clientType: 'web',
        },
        { ipAddress: '203.0.113.7' },
      );
    } catch (error) {
      rejected = error;
    }

    expect(rejected).toBeInstanceOf(HttpException);
    expect((rejected as HttpException).getStatus()).toBe(429);
    expect(prisma.transaction.oidcLoginAttempt.deleteMany).toHaveBeenCalledWith(
      {
        where: { expiresAt: { lte: expect.any(Date) } },
      },
    );
    expect(prisma.transaction.oidcLoginAttempt.count).toHaveBeenNthCalledWith(
      1,
      {
        where: {
          expiresAt: { gt: expect.any(Date) },
          provider: 'pocket_id',
          sourceHash: sha256('203.0.113.7'),
        },
      },
    );
    expect(prisma.transaction.oidcLoginAttempt.count).toHaveBeenNthCalledWith(
      2,
      {
        where: {
          expiresAt: { gt: expect.any(Date) },
          provider: 'pocket_id',
        },
      },
    );
    expect(prisma.transaction.oidcLoginAttempt.create).not.toHaveBeenCalled();
  });

  it('rejects only the source that reaches its attempt cap', async () => {
    const prisma = createPrismaMock();
    mockDiscovery();
    prisma.transaction.oidcLoginAttempt.count.mockResolvedValueOnce(100);

    await expect(
      createService(prisma).start(
        {
          clientNonce: CLIENT_NONCE,
          clientType: 'android',
        },
        { ipAddress: '203.0.113.8' },
      ),
    ).rejects.toThrow('too many Pocket ID sign-in attempts');

    expect(prisma.transaction.oidcLoginAttempt.count).toHaveBeenCalledTimes(1);
    expect(prisma.transaction.oidcLoginAttempt.create).not.toHaveBeenCalled();
  });

  it('retries serializable attempt-creation conflicts', async () => {
    const prisma = createPrismaMock();
    mockDiscovery();
    let transactionAttempts = 0;
    prisma.$transaction.mockImplementation(
      (operation: (value: PrismaMock['transaction']) => unknown) => {
        transactionAttempts += 1;
        if (transactionAttempts < 3) {
          throw new Prisma.PrismaClientKnownRequestError(
            'serialization conflict',
            { clientVersion: '6.19.3', code: 'P2034' },
          );
        }
        return Promise.resolve(operation(prisma.transaction));
      },
    );

    await createService(prisma).start({
      clientNonce: CLIENT_NONCE,
      clientType: 'web',
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(3);
    expect(prisma.transaction.oidcLoginAttempt.create).toHaveBeenCalledTimes(1);
  });

  it('bounds serializable attempt-creation retries', async () => {
    const prisma = createPrismaMock();
    mockDiscovery();
    prisma.$transaction.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('serialization conflict', {
        clientVersion: '6.19.3',
        code: 'P2034',
      }),
    );

    await expect(
      createService(prisma).start({
        clientNonce: CLIENT_NONCE,
        clientType: 'web',
      }),
    ).rejects.toMatchObject({ code: 'P2034' });

    expect(prisma.$transaction).toHaveBeenCalledTimes(3);
  });

  it('verifies a Pocket ID callback and redirects with only a one-time ticket', async () => {
    const prisma = createPrismaMock();
    mockDiscovery();
    const service = createService(prisma);
    const { authorizationUrl } = await service.start({
      clientNonce: CLIENT_NONCE,
      clientType: 'web',
    });
    const state = new URL(authorizationUrl).searchParams.get('state')!;
    const stored =
      prisma.transaction.oidcLoginAttempt.create.mock.calls[0][0].data;
    prisma.oidcLoginAttempt.findUnique.mockResolvedValue({
      ...stored,
      callbackCompletedAt: null,
      consumedAt: null,
      createdAt: new Date(),
      exchangeTicketHash: null,
      id: 'attempt-1',
      issuer: null,
      issuerHash: null,
      preferredUsername: null,
      subject: null,
    });
    prisma.oidcLoginAttempt.updateMany.mockResolvedValue({ count: 1 });
    await mockTokenAndJwks(state);

    const redirect = new URL(
      await service.callback({ code: 'authorization-code', state }),
    );

    const fragment = new URLSearchParams(redirect.hash.slice(1));
    expect(redirect.origin + redirect.pathname).toBe(WEB_CALLBACK);
    expect(redirect.search).toBe('');
    expect(fragment.has('client_nonce')).toBe(false);
    expect(fragment.get('ticket')).toHaveLength(43);
    expect(fragment.has('access_token')).toBe(false);
    expect(prisma.oidcLoginAttempt.updateMany).toHaveBeenCalledWith({
      data: expect.objectContaining({
        callbackCompletedAt: expect.any(Date),
        exchangeTicketHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        expiresAt: expect.any(Date),
        issuer: ISSUER,
        preferredUsername: 'pocket-user',
        subject: 'pocket-subject',
      }),
      where: expect.objectContaining({ id: 'attempt-1' }),
    });
    const completion = prisma.oidcLoginAttempt.updateMany.mock.calls[1][0]
      .data as { callbackCompletedAt: Date; expiresAt: Date };
    expect(
      completion.expiresAt.getTime() - completion.callbackCompletedAt.getTime(),
    ).toBe(10 * 60 * 1000);
  });

  it('carries a missing optional username through a valid callback', async () => {
    const prisma = createPrismaMock();
    mockDiscovery();
    const service = createService(prisma);
    const { authorizationUrl } = await service.start({
      clientNonce: CLIENT_NONCE,
      clientType: 'web',
    });
    const state = new URL(authorizationUrl).searchParams.get('state')!;
    const stored =
      prisma.transaction.oidcLoginAttempt.create.mock.calls[0][0].data;
    prisma.oidcLoginAttempt.findUnique.mockResolvedValue({
      ...stored,
      callbackCompletedAt: null,
      callbackStartedAt: null,
      consumedAt: null,
      createdAt: new Date(),
      exchangeTicketHash: null,
      id: 'attempt-1',
      issuer: null,
      issuerHash: null,
      preferredUsername: null,
      subject: null,
    });
    prisma.oidcLoginAttempt.updateMany.mockResolvedValue({ count: 1 });
    await mockTokenAndJwks(state, {
      accessToken: 'provider-access-token',
      preferredUsername: null,
    });
    jest
      .mocked(global.fetch)
      .mockResolvedValueOnce(new Response(null, { status: 503 }));

    const redirect = new URL(
      await service.callback({ code: 'authorization-code', state }),
    );

    expect(
      new URLSearchParams(redirect.hash.slice(1)).get('ticket'),
    ).toHaveLength(43);
    expect(prisma.oidcLoginAttempt.updateMany).toHaveBeenCalledWith({
      data: expect.objectContaining({ preferredUsername: null }),
      where: expect.objectContaining({ id: 'attempt-1' }),
    });
  });

  it('rejects a duplicate callback before redeeming the authorization code', async () => {
    const prisma = createPrismaMock();
    mockDiscovery();
    const service = createService(prisma);
    const { authorizationUrl } = await service.start({
      clientNonce: CLIENT_NONCE,
      clientType: 'web',
    });
    const state = new URL(authorizationUrl).searchParams.get('state')!;
    const stored =
      prisma.transaction.oidcLoginAttempt.create.mock.calls[0][0].data;
    prisma.oidcLoginAttempt.findUnique.mockResolvedValue({
      ...stored,
      callbackCompletedAt: null,
      callbackStartedAt: null,
      consumedAt: null,
      createdAt: new Date(),
      exchangeTicketHash: null,
      id: 'attempt-1',
      issuer: null,
      issuerHash: null,
      preferredUsername: null,
      subject: null,
    });
    prisma.oidcLoginAttempt.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.callback({ code: 'authorization-code', state }),
    ).rejects.toThrow(GoneException);

    expect(prisma.oidcLoginAttempt.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.oidcLoginAttempt.updateMany).toHaveBeenCalledWith({
      data: { callbackStartedAt: expect.any(Date) },
      where: {
        callbackCompletedAt: null,
        callbackStartedAt: null,
        consumedAt: null,
        expiresAt: { gt: expect.any(Date) },
        id: 'attempt-1',
      },
    });
  });

  it.each([
    ['access_denied', 'access_denied'],
    ['server_error', 'authentication_failed'],
  ])(
    'maps provider error %s to client error %s',
    async (providerError, expectedClientError) => {
      const prisma = createPrismaMock();
      mockDiscovery();
      const service = createService(prisma);
      const { authorizationUrl } = await service.start({
        clientNonce: CLIENT_NONCE,
        clientType: 'web',
      });
      const state = new URL(authorizationUrl).searchParams.get('state')!;
      const stored =
        prisma.transaction.oidcLoginAttempt.create.mock.calls[0][0].data;
      prisma.oidcLoginAttempt.findUnique.mockResolvedValue({
        ...stored,
        callbackCompletedAt: null,
        consumedAt: null,
        createdAt: new Date(),
        exchangeTicketHash: null,
        id: 'attempt-1',
        issuer: null,
        issuerHash: null,
        preferredUsername: null,
        subject: null,
      });
      prisma.oidcLoginAttempt.updateMany.mockResolvedValue({ count: 1 });

      const redirect = new URL(
        await service.callback({ error: providerError, state }),
      );

      expect(new URLSearchParams(redirect.hash.slice(1)).get('error')).toBe(
        expectedClientError,
      );
      expect(prisma.oidcLoginAttempt.updateMany).toHaveBeenCalledWith({
        data: expect.objectContaining({ consumedAt: expect.any(Date) }),
        where: {
          callbackCompletedAt: null,
          callbackStartedAt: expect.any(Date),
          consumedAt: null,
          id: 'attempt-1',
        },
      });
    },
  );

  it.each([
    ['nonce', { nonce: 'wrong-nonce' }],
    ['issuer', { issuer: 'https://attacker.example.test' }],
    ['audience', { audience: 'another-client' }],
    ['authorized party', { azp: 'another-client' }],
    ['expiry', { expiresAt: Math.floor(Date.now() / 1000) - 60 }],
  ])(
    'fails closed when the ID token %s is invalid',
    async (_name, overrides) => {
      const prisma = createPrismaMock();
      mockDiscovery();
      const service = createService(prisma);
      const { authorizationUrl } = await service.start({
        clientNonce: CLIENT_NONCE,
        clientType: 'android',
      });
      const state = new URL(authorizationUrl).searchParams.get('state')!;
      const stored =
        prisma.transaction.oidcLoginAttempt.create.mock.calls[0][0].data;
      prisma.oidcLoginAttempt.findUnique.mockResolvedValue({
        ...stored,
        callbackCompletedAt: null,
        consumedAt: null,
        createdAt: new Date(),
        exchangeTicketHash: null,
        id: 'attempt-1',
        issuer: null,
        issuerHash: null,
        preferredUsername: null,
        subject: null,
      });
      prisma.oidcLoginAttempt.updateMany.mockResolvedValue({ count: 1 });
      await mockTokenAndJwks(state, overrides);

      const redirect = new URL(
        await service.callback({ code: 'authorization-code', state }),
      );

      const fragment = new URLSearchParams(redirect.hash.slice(1));
      expect(redirect.protocol).toBe('dev.narumi.kestrel:');
      expect(fragment.get('error')).toBe('authentication_failed');
      expect(fragment.has('ticket')).toBe(false);
      expect(prisma.oidcLoginAttempt.updateMany).toHaveBeenCalledWith({
        data: expect.objectContaining({ consumedAt: expect.any(Date) }),
        where: {
          callbackCompletedAt: null,
          callbackStartedAt: expect.any(Date),
          consumedAt: null,
          id: 'attempt-1',
        },
      });
    },
  );

  it('auto-provisions by immutable identity and atomically creates a Kestrel session', async () => {
    const prisma = createPrismaMock();
    const now = new Date();
    prisma.oidcLoginAttempt.findUnique.mockResolvedValue({
      callbackCompletedAt: now,
      clientNonceHash: sha256(CLIENT_NONCE),
      clientType: 'web',
      consumedAt: null,
      createdAt: now,
      exchangeTicketHash: sha256('exchange-ticket-value-1234567890123456'),
      expiresAt: new Date(now.getTime() + 60_000),
      id: 'attempt-1',
      issuer: ISSUER,
      issuerHash: sha256(ISSUER),
      pkceVerifierEncrypted: '',
      preferredUsername: 'pocket-user',
      provider: 'pocket_id',
      stateHash: sha256('state'),
      subject: 'pocket-subject',
    });
    prisma.transaction.oidcLoginAttempt.updateMany.mockResolvedValue({
      count: 1,
    });
    prisma.transaction.federatedIdentity.findUnique.mockResolvedValue(null);
    prisma.transaction.user.findUnique.mockResolvedValue(null);
    prisma.transaction.user.create.mockResolvedValue({
      id: 'user-1',
      username: 'pocket-user',
    });
    prisma.transaction.federatedIdentity.create.mockResolvedValue({
      id: 'identity-1',
      user: { id: 'user-1', username: 'pocket-user' },
    });
    prisma.transaction.session.create.mockResolvedValue({
      createdAt: now,
      expiresAt: new Date(now.getTime() + 60_000),
      id: 'session-1',
      lastUsedAt: now,
    });

    const result = await createService(prisma).exchange(
      {
        clientNonce: CLIENT_NONCE,
        exchangeTicket: 'exchange-ticket-value-1234567890123456',
      },
      { ipAddress: '127.0.0.1', userAgent: 'test-agent' },
    );

    expect(result).toEqual(
      expect.objectContaining({
        accessToken: 'kestrel-access-token',
        authMethod: 'pocket_id',
        refreshToken: expect.any(String),
        session: expect.objectContaining({ id: 'session-1' }),
        user: { id: 'user-1', username: 'pocket-user' },
      }),
    );
    expect(prisma.transaction.federatedIdentity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          issuer: ISSUER,
          provider: 'pocket_id',
          subject: 'pocket-subject',
        }),
      }),
    );
    expect(prisma.transaction.session.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
        userId: 'user-1',
      }),
      select: expect.any(Object),
    });
  });

  it('signs in an existing identity without a provider username or password hash', async () => {
    const prisma = createPrismaMock();
    const now = new Date();
    prisma.oidcLoginAttempt.findUnique.mockResolvedValue({
      ...completedAttempt(),
      preferredUsername: null,
    });
    prisma.transaction.oidcLoginAttempt.updateMany.mockResolvedValue({
      count: 1,
    });
    prisma.transaction.federatedIdentity.findUnique.mockResolvedValue({
      issuer: ISSUER,
      user: { id: 'user-1', username: 'existing-user' },
    });
    prisma.transaction.session.create.mockImplementation(
      ({ data }: { data: { expiresAt: Date; id: string } }) => ({
        createdAt: now,
        expiresAt: data.expiresAt,
        id: data.id,
        lastUsedAt: now,
      }),
    );

    const result = await createService(prisma).exchange({
      clientNonce: CLIENT_NONCE,
      exchangeTicket: 'exchange-ticket-value-1234567890123456',
    });

    expect(result.user).toEqual({ id: 'user-1', username: 'existing-user' });
    expect(prisma.transaction.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.transaction.user.create).not.toHaveBeenCalled();
  });

  it('recovers the same session after an exchange response is lost', async () => {
    const prisma = createPrismaMock();
    const attempt = completedAttempt();
    const now = new Date();
    prisma.oidcLoginAttempt.findUnique.mockResolvedValue(attempt);
    prisma.transaction.oidcLoginAttempt.updateMany.mockResolvedValue({
      count: 1,
    });
    prisma.transaction.federatedIdentity.findUnique.mockResolvedValue({
      issuer: ISSUER,
      user: { id: 'user-1', username: 'pocket-user' },
    });
    prisma.transaction.session.create.mockImplementation(
      ({ data }: { data: { expiresAt: Date; id: string } }) => ({
        createdAt: now,
        expiresAt: data.expiresAt,
        id: data.id,
        lastUsedAt: now,
      }),
    );
    const service = createService(prisma);
    const request = {
      clientNonce: CLIENT_NONCE,
      exchangeTicket: 'exchange-ticket-value-1234567890123456',
    };

    const first = await service.exchange(request);
    const stored =
      prisma.transaction.oidcLoginAttempt.updateMany.mock.calls[0][0].data;
    prisma.oidcLoginAttempt.findUnique.mockResolvedValue({
      ...attempt,
      consumedAt: stored.consumedAt,
      exchangeRefreshTokenEncrypted: stored.exchangeRefreshTokenEncrypted,
      exchangeSessionId: stored.exchangeSessionId,
      expiresAt: stored.expiresAt,
    });
    prisma.session.findUnique.mockResolvedValue({
      createdAt: first.session.createdAt,
      expiresAt: first.session.expiresAt,
      id: first.session.id,
      lastUsedAt: first.session.lastUsedAt,
      refreshTokenHash: sha256(first.refreshToken),
      revokedAt: null,
      user: first.user,
    });

    await expect(
      service.exchange({
        ...request,
        clientNonce: 'wrong-client-nonce-1234567890',
      }),
    ).rejects.toThrow(GoneException);
    const recovered = await service.exchange(request);

    expect(recovered.refreshToken).toBe(first.refreshToken);
    expect(recovered.session).toEqual(first.session);
    expect(recovered.user).toEqual(first.user);
    expect(stored.exchangeRefreshTokenEncrypted).toMatch(/^v1\./);
    expect(stored.exchangeSessionId).toBe(first.session.id);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('rejects nonce mismatch, username collisions, expired tickets, and replay', async () => {
    const prisma = createPrismaMock();
    const attempt = completedAttempt();
    prisma.oidcLoginAttempt.findUnique.mockResolvedValue(attempt);
    prisma.transaction.oidcLoginAttempt.updateMany.mockResolvedValue({
      count: 1,
    });
    prisma.transaction.federatedIdentity.findUnique.mockResolvedValue(null);
    prisma.transaction.user.findUnique.mockResolvedValue({ id: 'local-user' });
    const service = createService(prisma);

    await expect(
      service.exchange({
        clientNonce: 'wrong-client-nonce-1234567890',
        exchangeTicket: 'exchange-ticket-value-1234567890123456',
      }),
    ).rejects.toThrow(GoneException);

    await expect(
      service.exchange({
        clientNonce: CLIENT_NONCE,
        exchangeTicket: 'exchange-ticket-value-1234567890123456',
      }),
    ).rejects.toThrow(ConflictException);

    prisma.oidcLoginAttempt.findUnique.mockResolvedValue({
      ...attempt,
      expiresAt: new Date(Date.now() - 1),
    });
    await expect(
      service.exchange({
        clientNonce: CLIENT_NONCE,
        exchangeTicket: 'exchange-ticket-value-1234567890123456',
      }),
    ).rejects.toThrow(GoneException);

    prisma.oidcLoginAttempt.findUnique.mockResolvedValue({
      ...attempt,
      consumedAt: new Date(),
    });
    await expect(
      service.exchange({
        clientNonce: CLIENT_NONCE,
        exchangeTicket: 'exchange-ticket-value-1234567890123456',
      }),
    ).rejects.toThrow(GoneException);
  });
});

function createService(
  prisma: PrismaMock,
  configurationOverrides?: Record<string, string>,
): PocketIdService {
  const configuration: Record<string, string> = configurationOverrides ?? {
    AUTH_OIDC_FLOW_ENCRYPTION_KEY: ENCRYPTION_KEY,
    AUTH_POCKET_ID_CLIENT_ID: CLIENT_ID,
    AUTH_POCKET_ID_CLIENT_SECRET: 'client-secret',
    AUTH_POCKET_ID_ISSUER: ISSUER,
    AUTH_POCKET_ID_REDIRECT_URI: REDIRECT_URI,
    AUTH_POCKET_ID_WEB_CALLBACK_URI: WEB_CALLBACK,
  };

  return new PocketIdService(
    {
      issueToken: jest.fn(() => ({
        expiresAt: new Date(Date.now() + 900_000),
        token: 'kestrel-access-token',
      })),
    } as unknown as AccessTokenService,
    { log: jest.fn() } as unknown as AuthAuditService,
    {
      get: jest.fn((key: string) => configuration[key]),
    } as unknown as ConfigService,
    prisma as unknown as PrismaService,
  );
}

function createPrismaMock() {
  const transaction = {
    federatedIdentity: {
      create: jest.fn(),
      findUnique: jest.fn(),
    },
    oidcLoginAttempt: {
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn(),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      updateMany: jest.fn(),
    },
    session: {
      create: jest.fn(),
    },
    user: {
      create: jest.fn(),
      findUnique: jest.fn(),
    },
  };
  return {
    federatedIdentity: { findUnique: jest.fn() },
    oidcLoginAttempt: {
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
    session: {
      findUnique: jest.fn(),
    },
    transaction,
    $transaction: jest.fn((operation: (value: typeof transaction) => unknown) =>
      Promise.resolve(operation(transaction)),
    ),
  };
}

function mockDiscovery(): void {
  jest.spyOn(global, 'fetch').mockResolvedValueOnce(
    jsonResponse({
      authorization_endpoint: `${ISSUER}/authorize`,
      issuer: ISSUER,
      jwks_uri: `${ISSUER}/.well-known/jwks.json`,
      token_endpoint: `${ISSUER}/api/oidc/token`,
      userinfo_endpoint: `${ISSUER}/api/oidc/userinfo`,
    }),
  );
}

async function mockTokenAndJwks(
  expectedNonce: string,
  overrides: {
    accessToken?: string;
    audience?: string;
    azp?: string;
    expiresAt?: number;
    issuer?: string;
    nonce?: string;
    preferredUsername?: string | null;
  } = {},
): Promise<void> {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });
  const idToken = await new SignJWT({
    azp: overrides.azp,
    nonce: overrides.nonce ?? expectedNonce,
    preferred_username:
      overrides.preferredUsername === undefined
        ? 'pocket-user'
        : overrides.preferredUsername,
  })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
    .setIssuer(overrides.issuer ?? ISSUER)
    .setAudience(overrides.audience ?? CLIENT_ID)
    .setSubject('pocket-subject')
    .setIssuedAt()
    .setExpirationTime(overrides.expiresAt ?? '5m')
    .sign(privateKey);
  const publicJwk = publicKey.export({ format: 'jwk' });

  const fetchMock = jest.mocked(global.fetch);
  fetchMock.mockResolvedValueOnce(
    jsonResponse({
      access_token: overrides.accessToken,
      id_token: idToken,
    }),
  );
  fetchMock.mockResolvedValueOnce(
    jsonResponse({ keys: [{ ...publicJwk, alg: 'RS256', kid: 'test-key' }] }),
  );
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
    status: 200,
  });
}

function completedAttempt() {
  const now = new Date();
  return {
    callbackCompletedAt: now,
    clientNonceHash: sha256(CLIENT_NONCE),
    clientType: 'web',
    consumedAt: null,
    createdAt: now,
    exchangeRefreshTokenEncrypted: null,
    exchangeSessionId: null,
    exchangeTicketHash: sha256('exchange-ticket-value-1234567890123456'),
    expiresAt: new Date(now.getTime() + 60_000),
    id: 'attempt-1',
    issuer: ISSUER,
    issuerHash: sha256(ISSUER),
    pkceVerifierEncrypted: '',
    preferredUsername: 'pocket-user',
    provider: 'pocket_id',
    stateHash: sha256('state'),
    subject: 'pocket-subject',
  };
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
