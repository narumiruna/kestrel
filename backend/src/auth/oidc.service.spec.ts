/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { Prisma } from '@prisma/client';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { SignJWT } from 'jose';
import { ConfigService } from '../config.service';
import { ConflictException, GoneException } from '../http/errors';
import { PrismaService } from '../prisma/prisma.service';
import { AccessTokenService } from './access-token.service';
import { AuthAuditService } from './auth-audit.service';
import { OidcService } from './oidc.service';

const ISSUER = 'https://oidc.example.test';
const CLIENT_ID = 'client-id';
const CLIENT_NONCE = 'browser-attempt:1234567890abcdef';
const ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
const ANDROID_CALLBACK = 'https://kestrel.example.test/login/oidc/android';
const WEB_CALLBACK = 'https://kestrel.example.test/login/oidc';
const REDIRECT_URI =
  'https://kestrel.example.test/api/backend/auth/oidc/callback';
const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

type PrismaMock = ReturnType<typeof createPrismaMock>;

describe('OidcService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
    if (ORIGINAL_NODE_ENV == null) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = ORIGINAL_NODE_ENV;
    }
  });

  it('reports disabled without configuration and rejects partial configuration', async () => {
    const prisma = createPrismaMock();
    const disabled = createService(prisma, {});
    expect(disabled.getMethods()).toEqual({
      oidc: { displayName: 'OpenID Connect', enabled: false },
    });

    const partial = createService(prisma, {
      AUTH_OIDC_ISSUER: ISSUER,
    });
    expect(partial.getMethods()).toEqual({
      oidc: { displayName: 'OpenID Connect', enabled: false },
    });
    await expect(
      partial.start({ clientNonce: CLIENT_NONCE, clientType: 'web' }),
    ).rejects.toThrow('OIDC configuration is incomplete');

    const invalid = createService(prisma, {
      AUTH_OIDC_ANDROID_CALLBACK_URI: ANDROID_CALLBACK,
      AUTH_OIDC_CLIENT_ID: CLIENT_ID,
      AUTH_OIDC_CLIENT_SECRET: 'client-secret',
      AUTH_OIDC_FLOW_ENCRYPTION_KEY: 'invalid',
      AUTH_OIDC_ISSUER: ISSUER,
      AUTH_OIDC_REDIRECT_URI: REDIRECT_URI,
      AUTH_OIDC_WEB_CALLBACK_URI: WEB_CALLBACK,
    });
    expect(invalid.getMethods()).toEqual({
      oidc: { displayName: 'OpenID Connect', enabled: false },
    });
    await expect(
      invalid.start({ clientNonce: CLIENT_NONCE, clientType: 'web' }),
    ).rejects.toThrow(
      'AUTH_OIDC_FLOW_ENCRYPTION_KEY must contain exactly 32 bytes',
    );
  });

  it('defaults an empty display name without disabling valid configuration', () => {
    const service = createService(
      createPrismaMock(),
      configuredEnvironment({ AUTH_OIDC_DISPLAY_NAME: '   ' }),
    );

    expect(service.getMethods()).toEqual({
      oidc: { displayName: 'OpenID Connect', enabled: true },
    });
  });

  it('rejects HTTP OIDC URLs in production', async () => {
    process.env.NODE_ENV = 'production';
    const httpIssuer = 'http://oidc.example.test';
    const service = createService(
      createPrismaMock(),
      configuredEnvironment({
        AUTH_OIDC_ANDROID_CALLBACK_URI:
          'http://kestrel.example.test/login/oidc/android',
        AUTH_OIDC_ISSUER: httpIssuer,
        AUTH_OIDC_REDIRECT_URI:
          'http://kestrel.example.test/auth/oidc/callback',
        AUTH_OIDC_WEB_CALLBACK_URI: 'http://kestrel.example.test/login/oidc',
      }),
    );

    expect(service.getMethods().oidc.enabled).toBe(false);
    await expect(
      service.start({ clientNonce: CLIENT_NONCE, clientType: 'web' }),
    ).rejects.toThrow('OIDC Android callback URI is invalid');
  });

  it('creates a server-bound authorization request with PKCE, state, and nonce', async () => {
    const prisma = createPrismaMock();
    mockDiscovery();
    const service = createService(prisma);

    expect(service.getMethods()).toEqual({
      oidc: { displayName: 'Example Identity', enabled: true },
    });
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
    expect(state).toMatch(/^v1(?:\.[A-Za-z0-9_-]+){3}$/);
    expect(state).not.toContain(CLIENT_NONCE);
    expect(providerNonce).toBe(state);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.transaction.oidcLoginAttempt.create).not.toHaveBeenCalled();
  });

  it('preserves a trailing slash in the configured issuer identifier', async () => {
    const issuer = `${ISSUER}/`;
    mockDiscovery({ issuer });
    const service = createService(
      createPrismaMock(),
      configuredEnvironment({ AUTH_OIDC_ISSUER: issuer }),
    );

    await expect(
      service.start({ clientNonce: CLIENT_NONCE, clientType: 'web' }),
    ).resolves.toEqual({ authorizationUrl: expect.any(String) });
    expect((jest.mocked(global.fetch).mock.calls[0][0] as URL).toString()).toBe(
      `${ISSUER}/.well-known/openid-configuration`,
    );
  });

  it('preserves fixed query parameters in discovered provider endpoints', async () => {
    const prisma = createPrismaMock();
    const tokenEndpoint = `${ISSUER}/api/oidc/token?audience=kestrel`;
    mockDiscovery({
      authorizationEndpoint: `${ISSUER}/authorize?connection=employees`,
      tokenEndpoint,
    });
    const service = createService(prisma);
    const { authorizationUrl } = await service.start({
      clientNonce: CLIENT_NONCE,
      clientType: 'web',
    });
    const authorization = new URL(authorizationUrl);
    const state = authorization.searchParams.get('state')!;
    expect(authorization.searchParams.get('connection')).toBe('employees');
    await mockTokenAndJwks(state);

    await service.callback({ code: 'authorization-code', state });

    expect(jest.mocked(global.fetch).mock.calls[1][0]).toBe(
      `${ISSUER}/.well-known/jwks.json`,
    );
    expect(jest.mocked(global.fetch).mock.calls[2][0]).toBe(tokenEndpoint);
  });

  it('rejects a provider that advertises no PKCE S256 support', async () => {
    const prisma = createPrismaMock();
    mockDiscovery({ codeChallengeMethods: ['plain'] });

    await expect(
      createService(prisma).start({
        clientNonce: CLIENT_NONCE,
        clientType: 'web',
      }),
    ).rejects.toThrow('OIDC provider does not support PKCE S256');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects tampered and expired encrypted authorization state', async () => {
    jest.useFakeTimers({ now: new Date('2026-09-14T00:00:00.000Z') });
    const prisma = createPrismaMock();
    mockDiscovery();
    const service = createService(prisma);
    const { authorizationUrl } = await service.start({
      clientNonce: CLIENT_NONCE,
      clientType: 'web',
    });
    const state = new URL(authorizationUrl).searchParams.get('state')!;
    const stateParts = state.split('.');
    const replacement = stateParts[2].startsWith('a') ? 'b' : 'a';
    stateParts[2] = `${replacement}${stateParts[2].slice(1)}`;

    await expect(
      service.callback({ state: stateParts.join('.') }),
    ).rejects.toThrow('OIDC sign-in state is invalid');

    jest.advanceTimersByTime(11 * 60 * 1000);
    await expect(service.callback({ state })).rejects.toThrow(
      'OIDC sign-in attempt is invalid or expired',
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('verifies an OIDC callback using the default client_secret_basic method', async () => {
    const prisma = createPrismaMock();
    mockDiscovery();
    const service = createService(prisma);
    const { authorizationUrl } = await service.start({
      clientNonce: CLIENT_NONCE,
      clientType: 'web',
    });
    const state = new URL(authorizationUrl).searchParams.get('state')!;
    await mockTokenAndJwks(state);

    const redirect = new URL(
      await service.callback({ code: 'authorization-code', state }),
    );

    const tokenRequest = jest.mocked(global.fetch).mock.calls[2][1];
    expect(new Headers(tokenRequest?.headers).get('authorization')).toBe(
      `Basic ${Buffer.from('client-id:client-secret').toString('base64')}`,
    );
    expect((tokenRequest?.body as URLSearchParams).has('client_secret')).toBe(
      false,
    );
    const fragment = new URLSearchParams(redirect.hash.slice(1));
    expect(redirect.origin + redirect.pathname).toBe(WEB_CALLBACK);
    expect(redirect.search).toBe('');
    expect(fragment.has('client_nonce')).toBe(false);
    expect(fragment.get('ticket')).toHaveLength(43);
    expect(fragment.has('access_token')).toBe(false);
    expect(prisma.transaction.oidcLoginAttempt.deleteMany).toHaveBeenCalledWith(
      {
        where: { expiresAt: { lte: expect.any(Date) } },
      },
    );
    expect(prisma.transaction.oidcLoginAttempt.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        callbackStartedAt: expect.any(Date),
        clientNonceHash: sha256(CLIENT_NONCE),
        clientType: 'web',
        expiresAt: expect.any(Date),
        stateHash: sha256(state),
      }),
    });
    expect(prisma.oidcLoginAttempt.updateMany).toHaveBeenCalledWith({
      data: expect.objectContaining({
        callbackCompletedAt: expect.any(Date),
        exchangeTicketHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        expiresAt: expect.any(Date),
        issuer: ISSUER,
        preferredUsername: 'oidc-user',
        subject: 'oidc-subject',
      }),
      where: expect.objectContaining({ id: expect.any(String) }),
    });
    const claim = prisma.transaction.oidcLoginAttempt.create.mock.calls[0][0]
      .data as { callbackStartedAt: Date; expiresAt: Date };
    expect(claim.expiresAt.getTime() - claim.callbackStartedAt.getTime()).toBe(
      2 * 60 * 1000,
    );
    const completion = prisma.oidcLoginAttempt.updateMany.mock.calls[0][0]
      .data as { callbackCompletedAt: Date; expiresAt: Date };
    expect(
      completion.expiresAt.getTime() - completion.callbackCompletedAt.getTime(),
    ).toBe(10 * 60 * 1000);
  });

  it('form-encodes special characters for client_secret_basic', async () => {
    const prisma = createPrismaMock();
    const clientId = ' client id!()~ ';
    const clientSecret = " secret '()~ ";
    mockDiscovery();
    const service = createService(
      prisma,
      configuredEnvironment({
        AUTH_OIDC_CLIENT_ID: clientId,
        AUTH_OIDC_CLIENT_SECRET: clientSecret,
      }),
    );
    const { authorizationUrl } = await service.start({
      clientNonce: CLIENT_NONCE,
      clientType: 'web',
    });
    const state = new URL(authorizationUrl).searchParams.get('state')!;
    await mockTokenAndJwks(state, { audience: clientId });

    expect(new URL(authorizationUrl).searchParams.get('client_id')).toBe(
      clientId,
    );
    await service.callback({ code: 'authorization-code', state });

    const encode = (value: string) =>
      new URLSearchParams({ value }).toString().slice('value='.length);
    const tokenRequest = jest.mocked(global.fetch).mock.calls[2][1];
    expect(new Headers(tokenRequest?.headers).get('authorization')).toBe(
      `Basic ${Buffer.from(`${encode(clientId)}:${encode(clientSecret)}`).toString('base64')}`,
    );
  });

  it('supports client_secret_post and a missing optional username', async () => {
    const prisma = createPrismaMock();
    mockDiscovery({ tokenAuthMethods: ['client_secret_post'] });
    const service = createService(prisma);
    const { authorizationUrl } = await service.start({
      clientNonce: CLIENT_NONCE,
      clientType: 'web',
    });
    const state = new URL(authorizationUrl).searchParams.get('state')!;
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

    const tokenRequest = jest.mocked(global.fetch).mock.calls[2][1];
    expect(new Headers(tokenRequest?.headers).has('authorization')).toBe(false);
    expect((tokenRequest?.body as URLSearchParams).get('client_secret')).toBe(
      'client-secret',
    );
    expect(
      new URLSearchParams(redirect.hash.slice(1)).get('ticket'),
    ).toHaveLength(43);
    expect(prisma.oidcLoginAttempt.updateMany).toHaveBeenCalledWith({
      data: expect.objectContaining({ preferredUsername: null }),
      where: expect.objectContaining({ id: expect.any(String) }),
    });
  });

  it('rejects a replayed in-progress callback before contacting the token endpoint', async () => {
    const prisma = createPrismaMock();
    mockDiscovery();
    const service = createService(prisma);
    const { authorizationUrl } = await service.start({
      clientNonce: CLIENT_NONCE,
      clientType: 'web',
    });
    const state = new URL(authorizationUrl).searchParams.get('state')!;
    prisma.oidcLoginAttempt.findUnique.mockResolvedValue({
      ...completedAttempt(),
      callbackCompletedAt: null,
      exchangeTicketHash: null,
      expiresAt: new Date(Date.now() + 60_000),
      stateHash: sha256(state),
    });

    await expect(
      service.callback({ code: 'replayed-code', state }),
    ).rejects.toThrow(GoneException);
    expect(jest.mocked(global.fetch)).toHaveBeenCalledTimes(1);
  });

  it('releases a callback claim after transient discovery failure', async () => {
    const prisma = createPrismaMock();
    mockDiscovery();
    const startService = createService(prisma);
    const { authorizationUrl } = await startService.start({
      clientNonce: CLIENT_NONCE,
      clientType: 'web',
    });
    const state = new URL(authorizationUrl).searchParams.get('state')!;
    const callbackService = createService(prisma);
    jest
      .mocked(global.fetch)
      .mockRejectedValueOnce(new TypeError('provider unavailable'));

    await expect(
      callbackService.callback({ code: 'authorization-code', state }),
    ).rejects.toThrow('OIDC callback is temporarily unavailable');
    expect(prisma.oidcLoginAttempt.deleteMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ id: expect.any(String) }),
    });

    mockDiscovery();
    await mockTokenAndJwks(state);
    const redirect = new URL(
      await callbackService.callback({ code: 'authorization-code', state }),
    );
    expect(
      new URLSearchParams(redirect.hash.slice(1)).get('ticket'),
    ).toHaveLength(43);
  });

  it('retries transient callback completion storage failure', async () => {
    const prisma = createPrismaMock();
    mockDiscovery();
    const service = createService(prisma);
    const { authorizationUrl } = await service.start({
      clientNonce: CLIENT_NONCE,
      clientType: 'web',
    });
    const state = new URL(authorizationUrl).searchParams.get('state')!;
    await mockTokenAndJwks(state);
    prisma.oidcLoginAttempt.updateMany.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('database unavailable', {
        clientVersion: '6.19.3',
        code: 'P1001',
      }),
    );

    const redirect = new URL(
      await service.callback({ code: 'authorization-code', state }),
    );
    expect(
      new URLSearchParams(redirect.hash.slice(1)).get('ticket'),
    ).toHaveLength(43);
    expect(prisma.oidcLoginAttempt.updateMany).toHaveBeenCalledTimes(2);
    expect(prisma.oidcLoginAttempt.deleteMany).not.toHaveBeenCalled();
  });

  it.each([
    [1000, 0],
    [0, 120],
  ])(
    'rejects a new callback claim at the active/recent capacity (%i, %i)',
    async (activeClaims, recentClaims) => {
      const prisma = createPrismaMock();
      mockDiscovery();
      const service = createService(prisma);
      const { authorizationUrl } = await service.start({
        clientNonce: CLIENT_NONCE,
        clientType: 'web',
      });
      const state = new URL(authorizationUrl).searchParams.get('state')!;
      prisma.transaction.oidcLoginAttempt.count
        .mockResolvedValueOnce(activeClaims)
        .mockResolvedValueOnce(recentClaims);

      await expect(
        service.callback({ code: 'authorization-code', state }),
      ).rejects.toThrow('OIDC callback capacity is temporarily unavailable');
      expect(prisma.transaction.oidcLoginAttempt.create).not.toHaveBeenCalled();
      expect(jest.mocked(global.fetch)).toHaveBeenCalledTimes(1);
    },
  );

  it('retries a serializable callback-claim conflict', async () => {
    const prisma = createPrismaMock();
    mockDiscovery();
    const service = createService(prisma);
    const { authorizationUrl } = await service.start({
      clientNonce: CLIENT_NONCE,
      clientType: 'web',
    });
    const state = new URL(authorizationUrl).searchParams.get('state')!;
    await mockTokenAndJwks(state);
    prisma.$transaction.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('write conflict', {
        clientVersion: '6.19.3',
        code: 'P2034',
      }),
    );

    const redirect = new URL(
      await service.callback({ code: 'authorization-code', state }),
    );

    expect(
      new URLSearchParams(redirect.hash.slice(1)).get('ticket'),
    ).toHaveLength(43);
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
  });

  it('returns the same ticket when a completed provider callback is retried', async () => {
    const prisma = createPrismaMock();
    mockDiscovery();
    const service = createService(prisma);
    const { authorizationUrl } = await service.start({
      clientNonce: CLIENT_NONCE,
      clientType: 'web',
    });
    const state = new URL(authorizationUrl).searchParams.get('state')!;
    await mockTokenAndJwks(state);

    const firstRedirect = await service.callback({
      code: 'authorization-code',
      state,
    });
    const claim =
      prisma.transaction.oidcLoginAttempt.create.mock.calls[0][0].data;
    const completion = prisma.oidcLoginAttempt.updateMany.mock.calls[0][0].data;
    prisma.oidcLoginAttempt.findUnique.mockResolvedValue({
      ...completedAttempt(),
      ...claim,
      ...completion,
    });

    const retriedRedirect = await service.callback({
      code: 'authorization-code',
      state,
    });

    expect(retriedRedirect).toBe(firstRedirect);
    expect(jest.mocked(global.fetch)).toHaveBeenCalledTimes(3);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
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

      const redirect = new URL(
        await service.callback({ error: providerError, state }),
      );

      expect(new URLSearchParams(redirect.hash.slice(1)).get('error')).toBe(
        expectedClientError,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.oidcLoginAttempt.updateMany).not.toHaveBeenCalled();
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
      await mockTokenAndJwks(state, overrides);

      const redirect = new URL(
        await service.callback({ code: 'authorization-code', state }),
      );

      const fragment = new URLSearchParams(redirect.hash.slice(1));
      expect(redirect.origin + redirect.pathname).toBe(ANDROID_CALLBACK);
      expect(fragment.get('attempt')).toBe(sha256(CLIENT_NONCE));
      expect(fragment.get('error')).toBe('authentication_failed');
      expect(fragment.has('ticket')).toBe(false);
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.oidcLoginAttempt.updateMany).toHaveBeenCalledWith({
        data: expect.objectContaining({ consumedAt: expect.any(Date) }),
        where: expect.objectContaining({ id: expect.any(String) }),
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
      preferredUsername: 'oidc-user',
      provider: 'oidc',
      stateHash: sha256('state'),
      subject: 'oidc-subject',
    });
    prisma.transaction.oidcLoginAttempt.updateMany.mockResolvedValue({
      count: 1,
    });
    prisma.transaction.federatedIdentity.findUnique.mockResolvedValue(null);
    prisma.transaction.user.findUnique.mockResolvedValue(null);
    prisma.transaction.user.create.mockResolvedValue({
      id: 'user-1',
      username: 'oidc-user',
    });
    prisma.transaction.federatedIdentity.create.mockResolvedValue({
      id: 'identity-1',
      user: { id: 'user-1', username: 'oidc-user' },
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
        authMethod: 'oidc',
        refreshToken: expect.any(String),
        session: expect.objectContaining({ id: 'session-1' }),
        user: { id: 'user-1', username: 'oidc-user' },
      }),
    );
    expect(prisma.transaction.federatedIdentity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          issuer: ISSUER,
          provider: 'oidc',
          subject: 'oidc-subject',
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
      user: { id: 'user-1', username: 'oidc-user' },
    });
    prisma.transaction.session.create.mockImplementation(
      ({ data }: { data: { expiresAt: Date; id: string } }) => ({
        createdAt: now,
        expiresAt: data.expiresAt,
        id: data.id,
        lastUsedAt: now,
      }),
    );
    const auditLog = jest.fn().mockResolvedValue(undefined);
    const authAuditService = { log: auditLog } as unknown as AuthAuditService;
    const service = createService(prisma, undefined, authAuditService);
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
    expect(stored.exchangeSessionId).toBe(first.session.id);
    expect(stored).not.toHaveProperty('exchangeRefreshTokenEncrypted');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(auditLog).toHaveBeenCalledTimes(2);
    expect(auditLog).toHaveBeenLastCalledWith(
      expect.objectContaining({
        event: 'login',
        outcome: 'success',
        sessionId: first.session.id,
        userId: first.user.id,
      }),
    );
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
  authAuditService: AuthAuditService = {
    log: jest.fn(),
  } as unknown as AuthAuditService,
): OidcService {
  const configuration = configurationOverrides ?? configuredEnvironment();

  return new OidcService(
    {
      issueToken: jest.fn(() => ({
        expiresAt: new Date(Date.now() + 900_000),
        token: 'kestrel-access-token',
      })),
    } as unknown as AccessTokenService,
    authAuditService,
    {
      get: jest.fn((key: string) => configuration[key]),
    } as unknown as ConfigService,
    prisma as unknown as PrismaService,
  );
}

function configuredEnvironment(
  overrides: Record<string, string> = {},
): Record<string, string> {
  return {
    AUTH_OIDC_ANDROID_CALLBACK_URI: ANDROID_CALLBACK,
    AUTH_OIDC_CLIENT_ID: CLIENT_ID,
    AUTH_OIDC_CLIENT_SECRET: 'client-secret',
    AUTH_OIDC_DISPLAY_NAME: 'Example Identity',
    AUTH_OIDC_FLOW_ENCRYPTION_KEY: ENCRYPTION_KEY,
    AUTH_OIDC_ISSUER: ISSUER,
    AUTH_OIDC_REDIRECT_URI: REDIRECT_URI,
    AUTH_OIDC_WEB_CALLBACK_URI: WEB_CALLBACK,
    ...overrides,
  };
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
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUnique: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
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

function mockDiscovery(
  options: {
    authorizationEndpoint?: string;
    codeChallengeMethods?: string[];
    issuer?: string;
    tokenAuthMethods?: string[];
    tokenEndpoint?: string;
  } = {},
): void {
  jest.spyOn(global, 'fetch').mockResolvedValueOnce(
    jsonResponse({
      authorization_endpoint:
        options.authorizationEndpoint ?? `${ISSUER}/authorize`,
      ...(options.codeChallengeMethods == null
        ? {}
        : {
            code_challenge_methods_supported: options.codeChallengeMethods,
          }),
      issuer: options.issuer ?? ISSUER,
      jwks_uri: `${ISSUER}/.well-known/jwks.json`,
      token_endpoint: options.tokenEndpoint ?? `${ISSUER}/api/oidc/token`,
      ...(options.tokenAuthMethods == null
        ? {}
        : {
            token_endpoint_auth_methods_supported: options.tokenAuthMethods,
          }),
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
        ? 'oidc-user'
        : overrides.preferredUsername,
  })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
    .setIssuer(overrides.issuer ?? ISSUER)
    .setAudience(overrides.audience ?? CLIENT_ID)
    .setSubject('oidc-subject')
    .setIssuedAt()
    .setExpirationTime(overrides.expiresAt ?? '5m')
    .sign(privateKey);
  const publicJwk = publicKey.export({ format: 'jwk' });

  const fetchMock = jest.mocked(global.fetch);
  fetchMock.mockResolvedValueOnce(
    jsonResponse({ keys: [{ ...publicJwk, alg: 'RS256', kid: 'test-key' }] }),
  );
  fetchMock.mockResolvedValueOnce(
    jsonResponse({
      access_token: overrides.accessToken,
      id_token: idToken,
    }),
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
    exchangeSessionId: null,
    exchangeTicketHash: sha256('exchange-ticket-value-1234567890123456'),
    expiresAt: new Date(now.getTime() + 60_000),
    id: 'attempt-1',
    issuer: ISSUER,
    issuerHash: sha256(ISSUER),
    pkceVerifierEncrypted: '',
    preferredUsername: 'oidc-user',
    provider: 'oidc',
    stateHash: sha256('state'),
    subject: 'oidc-subject',
  };
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
