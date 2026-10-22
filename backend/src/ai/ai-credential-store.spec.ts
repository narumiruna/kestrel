/* eslint-disable @typescript-eslint/require-await */
import type { Credential } from '@earendil-works/pi-ai';
import { AiCredentialStore } from './ai-credential-store';
import { AiSecretBox } from './ai-secret-box';
import { createAiTestStore } from '../../test/support/ai-test-store';

const apiKey = { type: 'api_key' as const, key: 'private-api-key' };
const expired = {
  type: 'oauth' as const,
  access: 'old-access',
  refresh: 'private-refresh',
  expires: 1,
};
const fresh = {
  ...expired,
  access: 'new-access',
  expires: Date.now() + 3_600_000,
};
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('AiCredentialStore (protocol double, not database locking proof)', () => {
  function setup() {
    const db = createAiTestStore();
    const session = db.seedSession('alice');
    const secrets = new AiSecretBox({ get: () => 'ab'.repeat(32) } as never);
    const instance = (box = secrets) =>
      new AiCredentialStore(db.prisma as never, box, 'alice', session);
    return { db, session, secrets, instance, store: instance() };
  }

  it('isolates users and lists only public credential metadata', async () => {
    const { db, store, secrets } = setup();
    const bob = new AiCredentialStore(
      db.prisma as never,
      secrets,
      'bob',
      db.seedSession('bob'),
    );
    await store.replace('provider', apiKey, 0);
    expect(await bob.read('provider')).toBeUndefined();
    expect(await bob.list()).toEqual([]);
    await bob.replace('provider', { ...apiKey, key: 'bob-secret' }, 0);
    expect(await store.read('provider')).toEqual(apiKey);
    expect(await store.list()).toEqual([
      { providerId: 'provider', type: 'api_key' },
    ]);
    expect(JSON.stringify(await store.list())).not.toContain(apiKey.key);
  });

  it('fails closed without an encryption key but permits disconnect', async () => {
    const { store, instance, db } = setup();
    await store.replace('provider', apiKey, 0);
    const noKey = instance(new AiSecretBox({ get: () => undefined } as never));
    await expect(noKey.read('provider')).rejects.toThrow();
    await expect(noKey.replace('other', apiKey, 0)).rejects.toThrow();
    await noKey.disconnect('provider');
    expect(await noKey.read('provider')).toBeUndefined();
    expect(
      db.aiConnection.get('alice:provider')?.credentialEncrypted,
    ).toBeNull();
  });

  it('refreshes an expired credential once across independent instances', async () => {
    const { store, instance } = setup();
    await store.replace('provider', expired, 0);
    const entered = deferred();
    const release = deferred();
    const refresh = jest.fn(async (current: Credential | undefined) => {
      if (current?.type !== 'oauth' || current.expires > Date.now())
        return current;
      entered.resolve();
      await release.promise;
      return fresh;
    });
    const first = store.modify('provider', refresh);
    await entered.promise;
    const second = instance().modify('provider', refresh);
    release.resolve();
    await expect(Promise.all([first, second])).resolves.toEqual([fresh, fresh]);
    expect(
      refresh.mock.calls.filter(
        ([credential]) =>
          credential?.type === 'oauth' && credential.expires === 1,
      ),
    ).toHaveLength(1);
  });

  it('requires reconnect after a lost refresh response and a new store instance', async () => {
    const { store, instance } = setup();
    await store.replace('provider', expired, 0);
    await expect(
      store.modify('provider', async () => {
        throw new Error('response lost');
      }),
    ).rejects.toThrow('response lost');
    await expect(instance().read('provider')).rejects.toThrow();
    const retry = jest.fn();
    await expect(instance().modify('provider', retry)).rejects.toThrow();
    expect(retry).not.toHaveBeenCalled();
  });

  it('marks early refresh durably even while the access token is still valid', async () => {
    const { store, instance } = setup();
    await store.replace(
      'provider',
      { ...expired, expires: Date.now() + 120_000 },
      0,
    );
    await expect(
      store.modify('provider', async () => {
        throw new Error('early refresh response lost');
      }),
    ).rejects.toThrow('early refresh response lost');
    await expect(instance().read('provider')).rejects.toThrow(
      'AI_RECONNECT_REQUIRED',
    );
  });

  it('does not call an outbound refresh when its durable lease fence is lost', async () => {
    const { store, db } = setup();
    await store.replace('provider', expired, 0);
    const update = db.prisma.aiConnection.updateMany;
    jest
      .spyOn(db.prisma.aiConnection, 'updateMany')
      .mockImplementation(async (args) => {
        if (args.data?.status === 'reconnect_required') return { count: 0 };
        return update(args);
      });
    const refresh = jest.fn();
    await expect(store.modify('provider', refresh)).rejects.toThrow(
      'AI_CONFIGURATION_CHANGED',
    );
    expect(refresh).not.toHaveBeenCalled();
  });

  it.each(['replace', 'disconnect'] as const)(
    'does not resurrect a refresh after another process %s',
    async (operation) => {
      const { store, instance, db } = setup();
      await store.replace('provider', expired, 0);
      const entered = deferred();
      const release = deferred();
      const refresh = store.modify('provider', async () => {
        entered.resolve();
        await release.promise;
        return fresh;
      });
      const rejection = expect(refresh).rejects.toThrow();
      await entered.promise;
      // Simulate lease expiry/process takeover without waiting 45 seconds.
      db.aiConnection.get('alice:provider')!.leaseExpiresAt = new Date(0);
      if (operation === 'replace')
        await instance().replace('provider', apiKey, 1);
      else await instance().disconnect('provider', 1);
      release.resolve();
      await rejection;
      expect(await instance().read('provider')).toEqual(
        operation === 'replace' ? apiKey : undefined,
      );
    },
  );

  it('prevents credential writes after session revocation', async () => {
    const { store, db, session } = setup();
    await store.replace('provider', expired, 0);
    await expect(
      store.modify('provider', async () => {
        db.sessions.get(session)!.revokedAt = new Date();
        return fresh;
      }),
    ).rejects.toThrow();
    expect(db.aiConnection.get('alice:provider')?.status).toBe(
      'reconnect_required',
    );
  });

  it('rejects stale replacement and disconnect generations', async () => {
    const { store, instance } = setup();
    await store.replace('provider', apiKey, 0);
    await expect(
      instance().replace('provider', { ...apiKey, key: 'stale' }, 0),
    ).rejects.toThrow();
    await expect(instance().disconnect('provider', 0)).rejects.toThrow();
    expect(await store.read('provider')).toEqual(apiKey);
  });
});
