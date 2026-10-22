import type { ProviderAuthInteraction } from '@earendil-works/pi-ai';
import { setTimeout as delay } from 'node:timers/promises';
import { createAiTestStore } from '../../test/support/ai-test-store';
import type { AiCatalogService } from './ai-catalog';
import { providerLoginUrl } from './ai-login-bridge';
import type { AiLoginRunner } from './ai-pi-login';
import { AiSecretBox } from './ai-secret-box';
import { AiSettingsService } from './ai-settings.service';

jest.mock('./ai-catalog', () => ({ AiCatalogService: jest.fn() }));
const provider = 'openrouter';
const token = 'private-access-token';
const answer = 'private-manual-code';
const credential = {
  type: 'oauth' as const,
  access: token,
  refresh: 'private-refresh-token',
  expires: Date.now() + 3_600_000,
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
async function until(check: () => boolean) {
  for (let index = 0; index < 150; index++) {
    if (check()) return;
    await delay(10);
  }
  throw new Error('Bridge did not settle within 1500 ms');
}
function setup() {
  const db = createAiTestStore();
  const session = db.seedSession('alice');
  const bobSession = db.seedSession('bob');
  const otherSession = db.seedSession('alice');
  const secrets = new AiSecretBox({ get: () => 'ab'.repeat(32) } as never);
  const release = deferred<typeof credential>();
  const calls: ProviderAuthInteraction[] = [];
  let finished = 0;
  let handler = (_interaction: ProviderAuthInteraction) => {
    void _interaction;
    return release.promise;
  };
  const runner: AiLoginRunner = jest.fn(
    async (_provider, _user, interaction) => {
      calls.push(interaction);
      try {
        return await handler(interaction);
      } finally {
        finished++;
      }
    },
  );
  const catalog = {
    publicOrigin: () => null,
    assertMethod: () => Promise.resolve(),
    keyCredential: () => Promise.resolve({ type: 'api_key', key: 'dummy-key' }),
    catalog: () => Promise.resolve({ providers: [{ id: provider }] }),
  };
  const exchange = jest.fn(() =>
    Promise.reject(new Error('Unexpected exchange')),
  );
  const service = new AiSettingsService(
    db.prisma as never,
    catalog as unknown as AiCatalogService,
    secrets,
    exchange,
    runner,
  );
  const ids: string[] = [];
  const start = async () => {
    const attempt = await service.start('alice', session, provider);
    ids.push(attempt.id);
    await until(() => calls.length === ids.length);
    return attempt;
  };
  const poll = (id: string) => service.attempt('alice', session, id);
  const prompt = async (id: string) => {
    await until(() => {
      const encrypted: unknown = db.aiAuthorization.get(id)?.verifierEncrypted;
      if (typeof encrypted !== 'string') return false;
      return secrets
        .decrypt('alice', provider, `verifier:${id}`, encrypted)
        .includes('"prompt"');
    });
    const current = await poll(id);
    if (!current.interaction?.prompt) throw new Error('Missing prompt');
    return current.interaction.prompt;
  };
  const cleanup = async () => {
    db.sessions.get(session)!.revokedAt = null;
    for (const id of ids) await service.cancel('alice', session, id);
    release.resolve(credential);
    await until(() => finished === calls.length);
    // Let the bridge consume the runner result and execute its finally block.
    await delay(10);
    expect(calls.every((call) => call.signal.aborted)).toBe(true);
    expect(exchange).not.toHaveBeenCalled();
  };
  return {
    db,
    session,
    bobSession,
    otherSession,
    secrets,
    service,
    calls,
    runner,
    release,
    start,
    poll,
    prompt,
    cleanup,
    run: (next: typeof handler) => {
      handler = next;
    },
  };
}
type Harness = ReturnType<typeof setup>;
let harness: Harness | undefined;
afterEach(async () => {
  if (harness) await harness.cleanup();
  harness = undefined;
});
function create() {
  harness = setup();
  return harness;
}

describe('AiLoginBridge (protocol double, not PostgreSQL locking proof)', () => {
  it('encrypts owner-bound device interaction and consumes one encrypted manual answer', async () => {
    const h = create();
    const accepted = deferred<string>();
    h.run(async (interaction) => {
      interaction.notify({
        type: 'device_code',
        verificationUri: 'https://login.example.com/device',
        userCode: 'SECRET-DEVICE',
      });
      accepted.resolve(
        await interaction.prompt({
          type: 'manual_code',
          message: 'Paste code',
        }),
      );
      return h.release.promise;
    });
    const attempt = await h.start();
    const shown = await h.prompt(attempt.id);
    expect(await h.poll(attempt.id)).toMatchObject({
      status: 'processing',
      interaction: {
        authorizationUrl: 'https://login.example.com/device',
        userCode: 'SECRET-DEVICE',
        prompt: { id: shown.id, type: 'manual_code', message: 'Paste code' },
      },
    });
    const row = h.db.aiAuthorization.get(attempt.id)!;
    expect(Number.isFinite((row.heartbeatAt as Date).getTime())).toBe(true);
    const encrypted = row.verifierEncrypted as string;
    expect(encrypted).not.toContain('SECRET-DEVICE');
    expect(encrypted).not.toContain('Paste code');
    expect(
      JSON.parse(
        h.secrets.decrypt(
          'alice',
          provider,
          `verifier:${attempt.id}`,
          encrypted,
        ),
      ),
    ).toMatchObject({ prompt: { id: shown.id } });
    expect(() =>
      h.secrets.decrypt('bob', provider, `verifier:${attempt.id}`, encrypted),
    ).toThrow();
    expect(() =>
      h.secrets.decrypt('alice', provider, 'verifier:other', encrypted),
    ).toThrow();
    for (const [user, session] of [
      ['bob', h.bobSession],
      ['alice', h.otherSession],
    ]) {
      await expect(
        h.service.attempt(user, session, attempt.id),
      ).rejects.toThrow('AI_ATTEMPT_NOT_FOUND');
      await expect(
        h.service.respond(user, session, attempt.id, {
          promptId: shown.id,
          value: answer,
        }),
      ).rejects.toThrow('AI_ATTEMPT_NOT_FOUND');
    }
    await expect(
      h.service.respond('alice', h.session, attempt.id, {
        promptId: 'stale',
        value: answer,
      }),
    ).rejects.toThrow('AI_CONFIGURATION_CHANGED');
    const response = await h.service.respond('alice', h.session, attempt.id, {
      promptId: shown.id,
      value: answer,
    });
    expect(response.interaction?.prompt).toBeUndefined();
    const codeEncrypted = row.codeEncrypted as string;
    expect(codeEncrypted).not.toContain(answer);
    expect(
      JSON.parse(
        h.secrets.decrypt(
          'alice',
          provider,
          `code:${attempt.id}`,
          codeEncrypted,
        ),
      ),
    ).toEqual({ promptId: shown.id, value: answer });
    expect(() =>
      h.secrets.decrypt(
        'alice',
        provider,
        `verifier:${attempt.id}`,
        codeEncrypted,
      ),
    ).toThrow();
    await expect(
      h.service.respond('alice', h.session, attempt.id, {
        promptId: shown.id,
        value: answer,
      }),
    ).rejects.toThrow('AI_CONFIGURATION_CHANGED');
    await expect(accepted.promise).resolves.toBe(answer);
    expect(row.codeEncrypted).toBeNull();
    await expect(
      h.service.respond('alice', h.session, attempt.id, {
        promptId: shown.id,
        value: answer,
      }),
    ).rejects.toThrow('AI_CONFIGURATION_CHANGED');
    h.release.resolve(credential);
    await until(
      () => h.db.aiAuthorization.get(attempt.id)?.status === 'completed',
    );
    expect(h.db.aiAuthorization.get(attempt.id)).toMatchObject({
      verifierEncrypted: null,
      codeEncrypted: null,
    });
    expect(await h.service.store('alice', h.session).read(provider)).toEqual(
      credential,
    );
    const connection = h.db.aiConnection.get(`alice:${provider}`)!;
    expect(connection.credentialEncrypted).not.toContain(token);
    expect(JSON.stringify(await h.poll(attempt.id))).not.toContain(token);
  });

  it('accepts only an advertised select option and rejects an old prompt after the next prompt', async () => {
    const h = create();
    const selected = deferred<string>();
    h.run(async (interaction) => {
      selected.resolve(
        await interaction.prompt({
          type: 'select',
          message: 'Choose',
          options: [{ id: 'device', label: 'Device' }],
        }),
      );
      await interaction.prompt({ type: 'secret', message: 'Second secret' });
      return h.release.promise;
    });
    const attempt = await h.start();
    const first = await h.prompt(attempt.id);
    expect(first.options).toEqual([{ id: 'device', label: 'Device' }]);
    await expect(
      h.service.respond('alice', h.session, attempt.id, {
        promptId: first.id,
        value: 'other',
      }),
    ).rejects.toThrow('AI_INVALID_INPUT');
    expect(h.db.aiAuthorization.get(attempt.id)?.codeEncrypted).toBeNull();
    await h.service.respond('alice', h.session, attempt.id, {
      promptId: first.id,
      value: 'device',
    });
    await expect(selected.promise).resolves.toBe('device');
    const second = await h.prompt(attempt.id);
    expect(second.id).not.toBe(first.id);
    await expect(
      h.service.respond('alice', h.session, attempt.id, {
        promptId: first.id,
        value: answer,
      }),
    ).rejects.toThrow('AI_CONFIGURATION_CHANGED');
  });

  it.each([
    'cancel',
    'revoke',
    'expire',
    'replace',
    'disconnect',
    'restart',
  ] as const)('does not save a late runner result after %s', async (action) => {
    const h = create();
    const attempt = await h.start();
    let saved: unknown = null;
    if (action === 'cancel')
      await h.service.cancel('alice', h.session, attempt.id);
    if (action === 'revoke') {
      h.db.sessions.get(h.session)!.revokedAt = new Date();
      await expect(h.poll(attempt.id)).rejects.toThrow('AI_SESSION_EXPIRED');
    }
    if (action === 'expire') {
      h.db.aiAuthorization.get(attempt.id)!.expiresAt = new Date(0);
      expect(await h.poll(attempt.id)).toMatchObject({ status: 'expired' });
      await expect(
        h.service.respond('alice', h.session, attempt.id, {
          promptId: 'old',
          value: answer,
        }),
      ).rejects.toThrow('AI_ATTEMPT_CONSUMED');
    }
    if (action === 'replace') {
      await h.service.connect('alice', h.session, provider, {
        apiKey: 'dummy-key',
        expectedGeneration: 0,
      });
      saved = h.db.aiConnection.get(`alice:${provider}`)!.credentialEncrypted;
    }
    if (action === 'disconnect')
      await h.service.disconnect('alice', h.session, provider, {
        expectedGeneration: 0,
      });
    if (action === 'restart') {
      h.db.aiAuthorization.get(attempt.id)!.heartbeatAt = new Date(
        Date.now() - 16_000,
      );
      await expect(
        h.service.respond('alice', h.session, attempt.id, {
          promptId: 'old',
          value: answer,
        }),
      ).rejects.toThrow('AI_ATTEMPT_CONSUMED');
      // A new service has no local job: persisted heartbeat must fail closed.
      const restarted = new AiSettingsService(
        h.db.prisma as never,
        h.service.catalog,
        h.secrets,
        undefined,
        h.runner,
      );
      expect(
        await restarted.attempt('alice', h.session, attempt.id),
      ).toMatchObject({ status: 'failed' });
      await expect(
        h.service.respond('alice', h.session, attempt.id, {
          promptId: 'old',
          value: answer,
        }),
      ).rejects.toThrow('AI_ATTEMPT_CONSUMED');
    }
    h.release.resolve(credential);
    await until(() =>
      ['failed', 'cancelled'].includes(
        String(h.db.aiAuthorization.get(attempt.id)?.status),
      ),
    );
    await delay(10);
    expect(h.db.aiAuthorization.get(attempt.id)).toMatchObject({
      verifierEncrypted: null,
      codeEncrypted: null,
    });
    expect(h.db.aiConnection.get(`alice:${provider}`)).toMatchObject({
      credentialEncrypted: saved,
    });
    if (action === 'replace')
      expect(h.db.aiConnection.get(`alice:${provider}`)?.authMethod).toBe(
        'api_key',
      );
    else
      expect(h.db.aiConnection.get(`alice:${provider}`)?.status).toBe(
        'disconnected',
      );
  });

  it('returns generic failed metadata without exposing raw provider errors', async () => {
    const h = create();
    h.run(() => Promise.reject(new Error(`Bearer ${token} ${answer}`)));
    const attempt = await h.start();
    await until(
      () => h.db.aiAuthorization.get(attempt.id)?.status === 'failed',
    );
    const result = await h.poll(attempt.id);
    expect(result).toEqual({
      id: attempt.id,
      providerId: provider,
      status: 'failed',
      expiresAt: expect.any(String) as unknown,
    });
    expect(JSON.stringify(result)).not.toContain(token);
    expect(JSON.stringify(result)).not.toContain(answer);
    expect(h.db.aiAuthorization.get(attempt.id)).toMatchObject({
      verifierEncrypted: null,
      codeEncrypted: null,
    });
    expect(
      h.db.aiConnection.get(`alice:${provider}`)?.credentialEncrypted,
    ).toBeNull();
  });
});

describe('providerLoginUrl', () => {
  it('accepts a public HTTPS authorization link', () => {
    expect(
      providerLoginUrl('https://login.example.com/authorize?state=opaque'),
    ).toBe('https://login.example.com/authorize?state=opaque');
  });
  it.each([
    'http://login.example.com/auth',
    'https://localhost/auth',
    'https://sub.localhost/auth',
    'https://127.0.0.1/auth',
    'https://[::1]/auth',
    'https://192.168.1.2/auth',
    'https://8.8.8.8/auth',
    'javascript:alert(1)',
    'https://user:password@login.example.com/auth',
    'https://user@login.example.com/auth',
    'https://host.internal/auth',
    'https://host.local/auth',
  ])('rejects unsafe authorization link %s', (url) => {
    expect(() => providerLoginUrl(url)).toThrow('AI_PROVIDER_RESPONSE_INVALID');
  });
});
