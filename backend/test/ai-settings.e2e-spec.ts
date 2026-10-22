/* eslint-disable @typescript-eslint/require-await */
import { Hono } from 'hono';
import { AccessTokenService } from '../src/auth/access-token.service';
import { createSessionAuth } from '../src/auth/session-auth.middleware';
import type { AiCatalogService } from '../src/ai/ai-catalog';
import { aiError } from '../src/ai/ai-errors';
import { AiSecretBox } from '../src/ai/ai-secret-box';
import { createAiSettingsRoutes } from '../src/ai/ai-settings.routes';
import { AiSettingsService } from '../src/ai/ai-settings.service';
import type { AiLoginRunner } from '../src/ai/ai-pi-login';
import { createAiTestStore } from './support/ai-test-store';

jest.mock('../src/ai/ai-catalog', () => ({ AiCatalogService: jest.fn() }));
const key = 'dummy-private-api-key';
const signingSecret = 'dummy-access-token-signing-secret';
function setup(loginRunner?: AiLoginRunner) {
  const db = createAiTestStore();
  const alice = db.seedSession('alice');
  const bob = db.seedSession('bob');
  let available = true;
  const catalog = {
    publicOrigin: () => 'https://kestrel.test',
    assertMethod: async (provider: string, method: string) => {
      if (
        !available ||
        !['openrouter', 'openai-codex'].includes(provider) ||
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
    loginRunner,
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
        ['/respond', 'POST'],
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

  it('bridges a non-OpenRouter login with owner-bound single-use responses', async () => {
    const answer = 'dummy-manual-login-answer';
    const runner: AiLoginRunner = async (_provider, _user, interaction) => {
      interaction.notify({
        type: 'device_code',
        userCode: 'ABCD-1234',
        verificationUri: 'https://auth.openai.com/device',
      });
      expect(
        await interaction.prompt({
          type: 'manual_code',
          message: 'Enter the test code',
        }),
      ).toBe(answer);
      return {
        type: 'oauth',
        access: key,
        refresh: 'dummy-refresh',
        expires: Date.now() + 3600000,
      };
    };
    const { request, token, bob, db, exchange, service, alice } = setup(runner);
    const started = await request(
      '/ai/authorizations/openai-codex',
      undefined,
      'POST',
    );
    expect(started.status).toBe(201);
    const initial = (await started.json()) as { id: string };
    try {
      let current: {
        status: string;
        interaction?: { prompt?: { id: string }; userCode?: string };
      } = { status: 'processing' };
      for (let index = 0; index < 100; index++) {
        current = (await (
          await request(`/ai/authorizations/${initial.id}`)
        ).json()) as typeof current;
        if (current.interaction?.prompt) break;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      const promptId = current.interaction?.prompt?.id;
      expect(promptId).toBeDefined();
      expect(current.interaction?.userCode).toBe('ABCD-1234');
      await safeResponse(
        await request(
          `/ai/authorizations/${initial.id}/respond`,
          token('bob', bob),
          'POST',
          { promptId, value: answer },
        ),
        404,
      );
      const response = await request(
        `/ai/authorizations/${initial.id}/respond`,
        undefined,
        'POST',
        { promptId, value: answer },
      );
      expect(response.status).toBe(200);
      expect(await response.text()).not.toContain(answer);
      for (let index = 0; index < 100; index++) {
        current = (await (
          await request(`/ai/authorizations/${initial.id}`)
        ).json()) as typeof current;
        if (current.status === 'completed') break;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect(current.status).toBe('completed');
      await safeResponse(
        await request(
          `/ai/authorizations/${initial.id}/respond`,
          undefined,
          'POST',
          { promptId, value: answer },
        ),
        409,
      );
      const settings = await safeResponse(await request('/ai/settings'), 200);
      expect(settings.connections).toEqual([
        {
          providerId: 'openai-codex',
          authMethod: 'oauth',
          generation: 1,
          status: 'connected',
        },
      ]);
      expect(JSON.stringify([...db.aiAuthorization.values()])).not.toContain(
        answer,
      );
      expect(exchange).not.toHaveBeenCalled();
    } finally {
      await service.cancel('alice', alice, initial.id);
    }
  });

  it('redirects a state-less denial but rejects a success callback without state', async () => {
    const { service, alice, request, db, exchange } = setup();
    const attempt = await service.start('alice', alice, 'openrouter');
    const callback = `/ai/oauth/openrouter/callback/${attempt.id}`;
    const success = await request(`${callback}?code=dummy-callback-code`, '');
    expect((await safeResponse(success, 400)).code).toBe('AI_INVALID_INPUT');
    expect(db.aiAuthorization.get(attempt.id)?.status).toBe('pending');
    const denied = await request(
      `${callback}?error=access_denied&error_description=${key}`,
      '',
    );
    expect(denied.status).toBe(303);
    expect(denied.headers.get('Cache-Control')).toBe('no-store');
    expect(denied.headers.get('Referrer-Policy')).toBe('no-referrer');
    expect(denied.headers.get('Location')).toBe(
      `https://kestrel.test/dashboard/account?aiAttempt=${attempt.id}#ai-assistant`,
    );
    expect(await denied.text()).not.toContain(key);
    expect(db.aiAuthorization.get(attempt.id)).toMatchObject({
      status: 'failed',
      verifierEncrypted: null,
      codeEncrypted: null,
    });
    const status = await safeResponse(
      await request(`/ai/authorizations/${attempt.id}`),
      200,
    );
    expect(status.status).toBe('failed');
    const replay = await request(`${callback}?error=access_denied`, '');
    expect((await safeResponse(replay, 409)).code).toBe('AI_ATTEMPT_CONSUMED');
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
