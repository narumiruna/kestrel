/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { createHash, generateKeyPairSync } from 'node:crypto';
import { SignJWT } from 'jose';
import { ConfigService } from '../config.service';
import { ConflictException, GoneException } from '../http/errors';
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
    expect(prisma.oidcLoginAttempt.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        clientType: 'web',
        provider: 'pocket_id',
        pkceVerifierEncrypted: expect.stringMatching(/^v1\./),
        stateHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    });
    expect(prisma.oidcLoginAttempt.create.mock.calls[0][0].data).not.toEqual(
      expect.objectContaining({ state }),
    );
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
    const nonce = state.split('.')[0];
    const stored = prisma.oidcLoginAttempt.create.mock.calls[0][0].data;
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
    await mockTokenAndJwks(nonce);

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
        exchangeTicketHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        issuer: ISSUER,
        preferredUsername: 'pocket-user',
        subject: 'pocket-subject',
      }),
      where: expect.objectContaining({ id: 'attempt-1' }),
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
      const stored = prisma.oidcLoginAttempt.create.mock.calls[0][0].data;
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
        where: { consumedAt: null, id: 'attempt-1' },
      });
    },
  );

  it.each([
    ['nonce', { nonce: 'wrong-nonce' }],
    ['issuer', { issuer: 'https://attacker.example.test' }],
    ['audience', { audience: 'another-client' }],
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
      const stored = prisma.oidcLoginAttempt.create.mock.calls[0][0].data;
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
        where: { consumedAt: null, id: 'attempt-1' },
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
      create: jest.fn(),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
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
    audience?: string;
    expiresAt?: number;
    issuer?: string;
    nonce?: string;
  } = {},
): Promise<void> {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });
  const idToken = await new SignJWT({
    nonce: overrides.nonce ?? expectedNonce,
    preferred_username: 'pocket-user',
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
  fetchMock.mockResolvedValueOnce(jsonResponse({ id_token: idToken }));
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
