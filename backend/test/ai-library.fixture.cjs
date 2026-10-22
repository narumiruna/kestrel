// Offline integration fixture: build first. No login, provider transport, or inference is allowed.
const assert = require('node:assert/strict');
const { createUserAiModels } = require('../dist/ai/ai-user-models.js');
const { piRegistry, AiCatalogService } = require('../dist/ai/ai-catalog.js');

function store() {
  const entries = new Map();
  let tail = Promise.resolve();
  return {
    entries,
    read: (id) => Promise.resolve(entries.get(id)),
    list: () =>
      Promise.resolve(
        [...entries].map(([providerId, value]) => ({
          providerId,
          type: value.type,
        })),
      ),
    modify(id, update) {
      const result = tail.then(async () => {
        const next = await update(entries.get(id));
        if (next !== undefined) entries.set(id, next);
        return entries.get(id);
      });
      tail = result.catch(() => undefined);
      return result;
    },
    async delete(id) {
      await tail;
      entries.delete(id);
    },
  };
}

async function run() {
  let networkCalls = 0;
  globalThis.fetch = () => {
    networkCalls++;
    return Promise.reject(
      new Error('Provider network is forbidden in this fixture'),
    );
  };
  for (const name of [
    'OPENAI_API_KEY',
    'ANTHROPIC_API_KEY',
    'GEMINI_API_KEY',
    'GOOGLE_CLOUD_API_KEY',
    'AWS_BEARER_TOKEN_BEDROCK',
    'CLOUDFLARE_API_KEY',
  ]) {
    process.env[name] = 'fixture-ambient-key';
  }
  const catalog = {
    assertMethod(_provider, method) {
      return method === 'oauth'
        ? Promise.reject(new Error('Fixture OAuth unavailable'))
        : Promise.resolve();
    },
  };
  const firstStore = store();
  const secondStore = store();
  const first = await createUserAiModels(firstStore, catalog);
  const second = await createUserAiModels(secondStore, catalog);
  assert.deepEqual(Object.keys(first).sort(), ['checkAuth', 'getAuth']);
  const registry = await piRegistry();
  const providers = registry.models.getProviders();
  assert.equal(providers.length, 42);
  const counts = { chat: 0, image: 0, classifier: 0 };
  for (const model of registry.models.getAllModels())
    counts[registry.getModelType(model)]++;
  assert.deepEqual(counts, { chat: 1599, image: 63, classifier: 51 });
  const productionCatalog = new AiCatalogService(
    { get: () => 'https://fixture.kestrel.test' },
    { available: () => true },
  );
  const publicCatalog = await productionCatalog.catalog();
  assert.equal(publicCatalog.providers.length, providers.length);
  assert.equal(
    publicCatalog.providers.reduce(
      (count, provider) => count + provider.models.length,
      0,
    ),
    1713,
  );
  for (const provider of publicCatalog.providers) {
    const model = provider.models[0];
    if (!model) continue;
    const selection = {
      providerId: provider.id,
      authMethod: provider.methods[0].type,
      modelId: model.id,
      modelType: model.type,
      thinkingLevel: model.type === 'chat' ? model.thinkingLevels[0] : null,
    };
    assert.deepEqual(await productionCatalog.selection(selection), selection);
    for (const method of provider.methods) {
      if (!method.available)
        await assert.rejects(
          productionCatalog.assertMethod(provider.id, method.type),
        );
    }
  }
  assert.deepEqual(
    publicCatalog.providers
      .filter((provider) =>
        provider.methods.some(
          (method) => method.type === 'oauth' && method.available,
        ),
      )
      .map((provider) => provider.id),
    ['openrouter'],
  );
  for (const provider of providers)
    assert.equal(await first.getAuth(provider.id), undefined);
  firstStore.entries.set('openai', {
    type: 'api_key',
    key: 'fixture-first-user',
  });
  secondStore.entries.set('openai', {
    type: 'api_key',
    key: 'fixture-second-user',
  });
  assert.equal(
    (await first.getAuth('openai')).auth.apiKey,
    'fixture-first-user',
  );
  assert.equal(
    (await second.getAuth('openai')).auth.apiKey,
    'fixture-second-user',
  );
  firstStore.entries.delete('openai');
  assert.equal(await first.getAuth('openai'), undefined);
  assert.equal(
    (await second.getAuth('openai')).auth.apiKey,
    'fixture-second-user',
  );
  firstStore.entries.set('openai', {
    type: 'oauth',
    access: 'fixture-expired',
    refresh: 'fixture-refresh',
    expires: 0,
  });
  await assert.rejects(first.getAuth('openai'));
  assert.equal(firstStore.entries.get('openai').type, 'oauth');
  assert.equal(networkCalls, 0);
  console.log(
    JSON.stringify({
      node: process.version,
      providers: providers.length,
      models: counts,
      userAuthIsolation: 'passed',
      ambientResolverFallback: 'absent',
      unavailableOAuth: 'blocked',
      inferenceSurface: 'absent',
      networkCalls,
    }),
  );
}
run().catch(() => {
  console.error(
    'AI library integration fixture failed; credentials are not logged',
  );
  process.exitCode = 1;
});
