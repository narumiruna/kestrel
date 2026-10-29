/* eslint-disable @typescript-eslint/require-await */
import { createHash } from 'node:crypto';
import type { AiCatalogService } from './ai-catalog';
import { aiError } from './ai-errors';
import { AiSecretBox } from './ai-secret-box';
import { AiSettingsService } from './ai-settings.service';
import { createAiTestStore } from '../../test/support/ai-test-store';

jest.mock('./ai-catalog', () => ({ AiCatalogService: jest.fn() }));
const key = 'dummy-private-key';
const code = 'dummy-authorization-code';
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function setup() {
  const db = createAiTestStore();
  const session = db.seedSession('alice');
  const bobSession = db.seedSession('bob');
  const secrets = new AiSecretBox({ get: () => 'ab'.repeat(32) } as never);
  const catalog = {
    publicOrigin: () => 'https://kestrel.test',
    assertMethod: async (provider: string, method: string) => {
      if (provider !== 'openrouter' || !['oauth', 'api_key'].includes(method))
        aiError('AI_METHOD_UNAVAILABLE', 503);
    },
    keyCredential: async () => ({ type: 'api_key', key }),
    selection: async (value: unknown) => value,
    catalog: async () => ({
      providers: [
        { id: 'openrouter', name: 'OpenRouter', methods: [], models: [] },
      ],
    }),
  };
  const exchange = jest.fn(
    async (code: string, verifier: string, signal: AbortSignal) => {
      void code;
      void verifier;
      void signal;
      return key;
    },
  );
  const service = new AiSettingsService(
    db.prisma as never,
    catalog as unknown as AiCatalogService,
    secrets,
    exchange,
  );
  const start = () => service.start('alice', session, 'openrouter');
  const ready = async () => {
    const attempt = await start();
    await service.callback(attempt.id, {
      state: new URL(attempt.authorizationUrl!).searchParams.get('state')!,
      code,
    });
    return attempt;
  };
  return { db, session, bobSession, secrets, service, exchange, start, ready };
}
async function safeFailure(promise: Promise<unknown>, message: string) {
  await expect(promise).rejects.toThrow(message);
  await promise.catch((error: unknown) => {
    const text = String(error);
    expect(text).not.toContain(key);
    expect(text).not.toContain(code);
  });
}

describe('AiSettingsService (protocol double, not database isolation proof)', () => {
  it('keeps account defaults isolated and rejects stale or wrong-session writes', async () => {
    const { service, session, bobSession } = setup();
    const aliceSelection = {
      authMethod: 'api_key',
      providerId: 'openrouter',
      modelType: 'chat',
      modelId: 'alice-model',
      thinkingLevel: 'low',
    };
    const bobSelection = {
      ...aliceSelection,
      modelId: 'bob-model',
      thinkingLevel: 'high',
    };
    await service.save('alice', session, {
      generation: 0,
      selection: aliceSelection,
    });
    await service.save('bob', bobSession, {
      generation: 0,
      selection: bobSelection,
    });
    await safeFailure(
      service.save('bob', session, {
        generation: 1,
        selection: aliceSelection,
      }),
      'AI_SESSION_EXPIRED',
    );
    await safeFailure(
      service.save('alice', session, {
        generation: 0,
        selection: bobSelection,
      }),
      'AI_CONFIGURATION_CHANGED',
    );
    expect((await service.settings('alice', session)).selection).toEqual(
      aliceSelection,
    );
    expect((await service.settings('bob', bobSession)).selection).toEqual(
      bobSelection,
    );
  });

  it('distinguishes an in-progress OAuth refresh from a terminal reconnect requirement', async () => {
    const { service, session } = setup();
    const store = service.store('alice', session);
    await store.replace(
      'openrouter',
      { type: 'oauth', access: 'old-access', refresh: 'refresh', expires: 1 },
      0,
    );
    const started = deferred();
    const complete = deferred();
    const refreshing = store.modify('openrouter', async (credential) => {
      if (credential?.type !== 'oauth') throw new Error('fixture credential');
      started.resolve();
      await complete.promise;
      return {
        ...credential,
        access: 'new-access',
        expires: Date.now() + 60000,
      };
    });
    await started.promise;
    for (let poll = 0; poll < 2; poll++)
      expect(
        (await service.settings('alice', session)).connections[0],
      ).toMatchObject({
        generation: 1,
        status: 'reconnect_required',
        refreshing: true,
      });
    complete.resolve();
    await refreshing;
    expect(
      (await service.settings('alice', session)).connections[0],
    ).toMatchObject({ generation: 1, status: 'connected', refreshing: false });
    const failed = store.modify('openrouter', () =>
      Promise.reject(new Error('fixture refresh failure')),
    );
    await expect(failed).rejects.toThrow('fixture refresh failure');
    expect(
      (await service.settings('alice', session)).connections[0],
    ).toMatchObject({
      generation: 1,
      status: 'reconnect_required',
      refreshing: false,
    });
  });

  it('retains disconnected generations independently of settings generations', async () => {
    const { service, session } = setup();
    await service.connect('alice', session, 'openrouter', {
      apiKey: key,
      expectedGeneration: 0,
    });
    const result = await service.disconnect('alice', session, 'openrouter', {
      expectedGeneration: 1,
    });
    expect(result).toMatchObject({
      generation: 0,
      connections: [],
      connectionGenerations: { openrouter: 2 },
    });
    await safeFailure(
      service.connect('alice', session, 'openrouter', {
        apiKey: key,
        expectedGeneration: 0,
      }),
      'AI_CONFIGURATION_CHANGED',
    );
    await service.connect('alice', session, 'openrouter', {
      apiKey: key,
      expectedGeneration: 2,
    });
    expect(
      (await service.settings('alice', session)).connectionGenerations,
    ).toEqual({ openrouter: 3 });
  });

  it('bounds recent attempts even when each previous attempt is cancelled', async () => {
    const { start, service, session, db } = setup();
    for (let index = 0; index < 32; index++) {
      const attempt = await start();
      await service.cancel('alice', session, attempt.id);
    }
    await safeFailure(start(), 'AI_TOO_MANY_ATTEMPTS');
    for (const row of db.aiAuthorization.values()) row.expiresAt = new Date(0);
    await expect(start()).resolves.toMatchObject({ status: 'pending' });
    expect(db.aiAuthorization.size).toBe(1);
  });
  it('binds state and S256 PKCE to the exact callback and encrypted verifier', async () => {
    const { start, db, secrets, service, session, exchange } = setup();
    const attempt = await start();
    const url = new URL(attempt.authorizationUrl!);
    const row = db.aiAuthorization.get(attempt.id)!;
    const state = url.searchParams.get('state')!;
    const verifier = secrets.decrypt(
      'alice',
      'openrouter',
      `verifier:${attempt.id}`,
      row.verifierEncrypted as string,
    );
    expect(url.origin + url.pathname).toBe('https://openrouter.ai/auth');
    expect(url.searchParams.get('callback_url')).toBe(
      `https://kestrel.test/api/backend/ai/oauth/openrouter/callback/${attempt.id}`,
    );
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('code_challenge')).toBe(
      createHash('sha256').update(verifier).digest('base64url'),
    );
    expect(row.stateHash).toBe(
      createHash('sha256').update(state).digest('hex'),
    );
    expect(row.verifierEncrypted).not.toContain(verifier);
    await safeFailure(
      service.callback(attempt.id, { state: 'wrong', code }),
      'AI_STATE_MISMATCH',
    );
    expect(db.aiAuthorization.get(attempt.id)?.status).toBe('pending');
    await service.callback(attempt.id, { state, code });
    await safeFailure(
      service.callback(attempt.id, { state, code }),
      'AI_ATTEMPT_CONSUMED',
    );
    await service.complete('alice', session, attempt.id);
    expect(exchange).toHaveBeenCalledWith(
      code,
      verifier,
      expect.any(AbortSignal),
    );
  });

  it.each([
    [{ code }, 'AI_INVALID_INPUT'],
    [{ error: 'access_denied', code }, 'AI_INVALID_INPUT'],
    [{ error: 'access_denied', state: 'wrong' }, 'AI_STATE_MISMATCH'],
    [{ error: 'access_denied', state: '' }, 'AI_INVALID_INPUT'],
    [{ error: '' }, 'AI_INVALID_INPUT'],
    [{ error: 'x'.repeat(129) }, 'AI_INVALID_INPUT'],
  ] as const)(
    'rejects an invalid callback %j without consuming the attempt',
    async (values, message) => {
      const { start, service, db, exchange } = setup();
      const attempt = await start();
      const verifier: unknown = db.aiAuthorization.get(
        attempt.id,
      )!.verifierEncrypted;
      await safeFailure(service.callback(attempt.id, values), message);
      expect(db.aiAuthorization.get(attempt.id)).toMatchObject({
        status: 'pending',
        verifierEncrypted: verifier,
        codeEncrypted: null,
      });
      expect(exchange).not.toHaveBeenCalled();
    },
  );

  it.each([false, true])(
    'keeps the saved connection on denial with state=%s',
    async (withState) => {
      const { service, session, start, db, exchange } = setup();
      await service.connect('alice', session, 'openrouter', {
        apiKey: key,
        expectedGeneration: 0,
      });
      const previousGeneration: unknown =
        db.aiConnection.get('alice:openrouter')!.generation;
      const previousEncrypted: unknown =
        db.aiConnection.get('alice:openrouter')!.credentialEncrypted;
      const attempt = await start();
      await service.callback(attempt.id, {
        error: 'access_denied',
        ...(withState
          ? {
              state: new URL(attempt.authorizationUrl!).searchParams.get(
                'state',
              )!,
            }
          : {}),
      });
      expect(db.aiConnection.get('alice:openrouter')).toMatchObject({
        generation: previousGeneration,
        credentialEncrypted: previousEncrypted,
        status: 'connected',
        authMethod: 'api_key',
      });
      expect(db.aiAuthorization.get(attempt.id)).toMatchObject({
        status: 'failed',
        verifierEncrypted: null,
        codeEncrypted: null,
      });
      expect(exchange).not.toHaveBeenCalled();
    },
  );

  it.each(['expired', 'cancelled', 'revoked'] as const)(
    'rejects state-less denial for an %s attempt',
    async (kind) => {
      const { start, service, session, db, exchange } = setup();
      const attempt = await start();
      if (kind === 'expired')
        db.aiAuthorization.get(attempt.id)!.expiresAt = new Date(0);
      if (kind === 'cancelled')
        await service.cancel('alice', session, attempt.id);
      if (kind === 'revoked') db.sessions.get(session)!.revokedAt = new Date();
      const message =
        kind === 'expired'
          ? 'AI_ATTEMPT_EXPIRED'
          : kind === 'cancelled'
            ? 'AI_ATTEMPT_CONSUMED'
            : 'AI_SESSION_EXPIRED';
      await safeFailure(
        service.callback(attempt.id, { error: 'access_denied' }),
        message,
      );
      expect(exchange).not.toHaveBeenCalled();
      expect(
        db.aiConnection.get('alice:openrouter')!.credentialEncrypted,
      ).toBeNull();
    },
  );

  it('handles denial, cancellation, replay and expiry without exchanging', async () => {
    const { start, ready, service, session, db, exchange } = setup();
    const denied = await start();
    expect(await service.callback(denied.id, { error: 'access_denied' })).toBe(
      `https://kestrel.test/dashboard/account?aiAttempt=${denied.id}#ai-assistant`,
    );
    await safeFailure(
      service.callback(denied.id, { error: 'access_denied' }),
      'AI_ATTEMPT_CONSUMED',
    );
    expect(db.aiAuthorization.get(denied.id)).toMatchObject({
      status: 'failed',
      verifierEncrypted: null,
      codeEncrypted: null,
    });
    await safeFailure(
      service.complete('alice', session, denied.id),
      'AI_ATTEMPT_CONSUMED',
    );
    const cancelled = await ready();
    await service.cancel('alice', session, cancelled.id);
    await safeFailure(
      service.complete('alice', session, cancelled.id),
      'AI_ATTEMPT_CONSUMED',
    );
    expect(db.aiAuthorization.get(cancelled.id)).toMatchObject({
      status: 'cancelled',
      verifierEncrypted: null,
      codeEncrypted: null,
    });
    const expired = await ready();
    db.aiAuthorization.get(expired.id)!.expiresAt = new Date(0);
    await safeFailure(
      service.complete('alice', session, expired.id),
      'AI_ATTEMPT_EXPIRED',
    );
    await safeFailure(
      service.callback(expired.id, {
        state: new URL(expired.authorizationUrl!).searchParams.get('state')!,
        code,
      }),
      'AI_ATTEMPT_EXPIRED',
    );
    expect(exchange).not.toHaveBeenCalled();
  });

  it('rejects other owners and sessions and makes completed retries idempotent', async () => {
    const { ready, service, session, bobSession, db, exchange } = setup();
    const attempt = await ready();
    await safeFailure(
      service.complete('bob', bobSession, attempt.id),
      'AI_ATTEMPT_NOT_FOUND',
    );
    await safeFailure(
      service.complete('alice', db.seedSession('alice'), attempt.id),
      'AI_ATTEMPT_NOT_FOUND',
    );
    const result = await service.complete('alice', session, attempt.id);
    expect(await service.complete('alice', session, attempt.id)).toEqual(
      result,
    );
    expect(result.status).toBe('completed');
    expect(exchange).toHaveBeenCalledTimes(1);
    expect(db.aiAuthorization.get(attempt.id)).toMatchObject({
      verifierEncrypted: null,
      codeEncrypted: null,
    });
  });

  it.each(['replace', 'disconnect', 'revoke'] as const)(
    'does not resurrect credentials after %s during exchange',
    async (action) => {
      const { ready, service, session, db, exchange } = setup();
      const attempt = await ready();
      const entered = deferred();
      const release = deferred();
      exchange.mockImplementation(async () => {
        entered.resolve();
        await release.promise;
        return key;
      });
      const completion = service.complete('alice', session, attempt.id);
      await entered.promise;
      if (action === 'replace')
        await service.connect('alice', session, 'openrouter', {
          apiKey: key,
          expectedGeneration: 0,
        });
      if (action === 'disconnect')
        await service.disconnect('alice', session, 'openrouter', {
          expectedGeneration: 0,
        });
      if (action === 'revoke') db.sessions.get(session)!.revokedAt = new Date();
      release.resolve();
      await safeFailure(completion, 'AI_AUTHORIZATION_FAILED');
      expect(db.aiAuthorization.get(attempt.id)).toMatchObject({
        verifierEncrypted: null,
        codeEncrypted: null,
      });
      const connection = db.aiConnection.get('alice:openrouter')!;
      if (action === 'replace') expect(connection.authMethod).toBe('api_key');
      else expect(connection.credentialEncrypted).toBeNull();
    },
  );

  it('fails closed after a lost exchange response and wipes attempt secrets', async () => {
    const { ready, service, session, db, exchange } = setup();
    const attempt = await ready();
    exchange.mockRejectedValue(new Error(`${key} ${code}`));
    await safeFailure(
      service.complete('alice', session, attempt.id),
      'AI_AUTHORIZATION_FAILED',
    );
    expect(db.aiAuthorization.get(attempt.id)).toMatchObject({
      status: 'failed',
      verifierEncrypted: null,
      codeEncrypted: null,
    });
    await safeFailure(
      service.complete('alice', session, attempt.id),
      'AI_ATTEMPT_CONSUMED',
    );
    expect(exchange).toHaveBeenCalledTimes(1);
    expect(
      db.aiConnection.get('alice:openrouter')?.credentialEncrypted,
    ).toBeNull();
  });

  it('returns isolated, secret-free settings for two users', async () => {
    const { service, session, bobSession, db } = setup();
    await service.connect('alice', session, 'openrouter', {
      apiKey: key,
      expectedGeneration: 0,
    });
    const alice = await service.settings('alice', session);
    const bob = await service.settings('bob', bobSession);
    expect(alice.connections).toEqual([
      {
        providerId: 'openrouter',
        authMethod: 'api_key',
        status: 'connected',
        generation: 1,
        refreshing: false,
      },
    ]);
    expect(bob.connections).toEqual([]);
    const serialized = JSON.stringify({ alice, bob });
    expect(serialized).not.toContain(key);
    expect(serialized).not.toContain('credentialEncrypted');
    expect(serialized).not.toContain(
      db.aiConnection.get('alice:openrouter')!.credentialEncrypted,
    );
  });
});
