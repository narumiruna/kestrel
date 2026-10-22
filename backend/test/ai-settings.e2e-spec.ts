/* eslint-disable @typescript-eslint/require-await */
import { Hono } from 'hono';
import { AccessTokenService } from '../src/auth/access-token.service';
import { createSessionAuth } from '../src/auth/session-auth.middleware';
import type { AiCatalogService } from '../src/ai/ai-catalog';
import { aiError } from '../src/ai/ai-errors';
import { AiSecretBox } from '../src/ai/ai-secret-box';
import { createAiSettingsRoutes } from '../src/ai/ai-settings.routes';
import { AiSettingsService } from '../src/ai/ai-settings.service';
import { createAiTestStore } from './support/ai-test-store';

jest.mock('../src/ai/ai-catalog', () => ({ AiCatalogService: jest.fn() }));
const key = 'dummy-private-api-key';
const signingSecret = 'dummy-access-token-signing-secret';
function setup() {
  const db = createAiTestStore();
  const alice = db.seedSession('alice');
  const bob = db.seedSession('bob');
  let available = true;
  const catalog = {
    publicOrigin: () => 'https://kestrel.test',
    assertMethod: async (provider: string, method: string) => {
      if (
        !available ||
        provider !== 'openrouter' ||
        !['api_key', 'oauth'].includes(method)
      )
        aiError('AI_METHOD_UNAVAILABLE', 503);
    },
    keyCredential: async (provider: string) => {
      await catalog.assertMethod(provider, 'api_key');
      return { type: 'api_key', key };
    },
    catalog: async () => ({
      providers: [
        {
          id: 'openrouter',
          name: 'OpenRouter',
          methods: [{ type: 'oauth', available }],
          models: [],
        },
      ],
    }),
  };
  const tokens = new AccessTokenService({
    get: (name: string) =>
      name === 'AUTH_ACCESS_TOKEN_SECRET' ? signingSecret : undefined,
  } as never);
  const exchange = jest.fn(async () => key);
  const service = new AiSettingsService(
    db.prisma as never,
    catalog as unknown as AiCatalogService,
    new AiSecretBox({ get: () => 'ab'.repeat(32) } as never),
    exchange,
  );
  const app = new Hono().route(
    '/',
    createAiSettingsRoutes(
      service,
      createSessionAuth(tokens, db.prisma as never),
    ),
  );
  const token = (userId = 'alice', sessionId = alice) =>
    tokens.issueToken({ userId, sessionId }).token;
  const request = (
    path: string,
    bearer: string | undefined = token(),
    method = 'GET',
    body?: unknown,
  ) =>
    app.request(path, {
      method,
      headers: {
        ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
        'Content-Type': 'application/json',
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  return {
    db,
    alice,
    bob,
    token,
    request,
    service,
    exchange,
    unavailable: () => {
      available = false;
    },
  };
}
async function safeResponse(response: Response, status: number) {
  expect(response.status).toBe(status);
  expect(response.headers.get('Cache-Control')).toBe('no-store');
  expect(response.headers.get('Referrer-Policy')).toBe('no-referrer');
  const text = await response.text();
  for (const secret of [key, signingSecret, 'dummy-callback-code'])
    expect(text).not.toContain(secret);
  expect(text).not.toMatch(
    /credentialEncrypted|verifierEncrypted|codeEncrypted/,
  );
  return JSON.parse(text) as Record<string, unknown>;
}

describe('AI settings HTTP routes with real session authentication', () => {
  it.each([
    'missing-token',
    'missing-session',
    'expired-session',
    'revoked-session',
    'expired-token',
  ] as const)('rejects %s safely', async (kind) => {
    const { db, alice, token, request } = setup();
    let bearer = token();
    if (kind === 'missing-token') bearer = '';
    if (kind === 'missing-session') db.sessions.delete(alice);
    if (kind === 'expired-session')
      db.sessions.get(alice)!.expiresAt = new Date(0);
    if (kind === 'revoked-session')
      db.sessions.get(alice)!.revokedAt = new Date();
    if (kind === 'expired-token') {
      const tokens = new AccessTokenService({
        get: (name: string) =>
          name === 'AUTH_ACCESS_TOKEN_SECRET' ? signingSecret : undefined,
      } as never);
      bearer = tokens.issueToken(
        { userId: 'alice', sessionId: alice },
        new Date(0),
      ).token;
    }
    await safeResponse(await request('/ai/settings', bearer), 401);
  });

  it('hides attempts from another user and another session', async () => {
    const { service, alice, bob, token, request, db, exchange } = setup();
    const attempt = await service.start('alice', alice, 'openrouter');
    for (const bearer of [
      token('bob', bob),
      token('alice', db.seedSession('alice')),
    ]) {
      for (const [suffix, method] of [
        ['', 'GET'],
        ['', 'DELETE'],
        ['/complete', 'POST'],
      ]) {
        const body = await safeResponse(
          await request(
            `/ai/authorizations/${attempt.id}${suffix}`,
            bearer,
            method,
          ),
          404,
        );
        expect(body.code).toBe('AI_ATTEMPT_NOT_FOUND');
      }
    }
    expect(exchange).not.toHaveBeenCalled();
    expect(db.aiAuthorization.get(attempt.id)?.status).toBe('pending');
  });

  it('rejects unavailable credentials and authorization without writes or exchange', async () => {
    const { unavailable, request, db, exchange } = setup();
    unavailable();
    await safeResponse(
      await request('/ai/connections/openrouter', undefined, 'POST', {
        apiKey: key,
        expectedGeneration: 0,
      }),
      503,
    );
    await safeResponse(
      await request('/ai/authorizations/openrouter', undefined, 'POST'),
      503,
    );
    expect(db.aiConnection.size).toBe(0);
    expect(db.aiAuthorization.size).toBe(0);
    expect(exchange).not.toHaveBeenCalled();
  });

  it('returns secret-free settings and safe callback errors with security headers', async () => {
    const { request, token, bob, service, alice, exchange } = setup();
    await service.connect('alice', alice, 'openrouter', {
      apiKey: key,
      expectedGeneration: 0,
    });
    const own = await safeResponse(await request('/ai/settings'), 200);
    expect(own.connections).toHaveLength(1);
    const other = await safeResponse(
      await request('/ai/settings', token('bob', bob)),
      200,
    );
    expect(other.connections).toEqual([]);
    const attempt = await service.start('alice', alice, 'openrouter');
    const response = await request(
      `/ai/oauth/openrouter/callback/${attempt.id}?state=wrong&code=dummy-callback-code`,
      '',
    );
    expect((await safeResponse(response, 403)).code).toBe('AI_STATE_MISMATCH');
    expect(exchange).not.toHaveBeenCalled();
  });
});
