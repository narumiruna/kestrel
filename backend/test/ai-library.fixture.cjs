// Offline integration fixture: build first. No live provider login, transport, or inference is allowed.
const assert = require('node:assert/strict');
const { createUserAiModels } = require('../dist/ai/ai-user-models.js');
const { piRegistry, AiCatalogService } = require('../dist/ai/ai-catalog.js');
const { loginWithPi } = require('../dist/ai/ai-pi-login.js');
const { aiAuthWorkerRuntime } = require('../dist/ai/ai-auth-worker-client.js');
const { Worker } = require('node:worker_threads');
const { dirname, join } = require('node:path');

// A protocol error message proves the worker module loaded. A native worker error must fail the test.
async function assertWorkerEntry(clientFilename) {
  const runtime = aiAuthWorkerRuntime(clientFilename);
  const adapter = join(
    dirname(clientFilename),
    clientFilename.endsWith('.ts') ? 'ai-pi-login.ts' : 'ai-pi-login.js',
  );
  const entry = runtime.eval
    ? runtime.entry
    : `require(${JSON.stringify(runtime.entry)});`;
  const probe = `require(${JSON.stringify(adapter)}).loadAiOAuthProvider('openai-codex').then(value=>require('node:worker_threads').parentPort.postMessage({type:'fixture-loaded',usable:typeof value?.login==='function'})).catch(()=>require('node:worker_threads').parentPort.postMessage({type:'fixture-failed'}));`;
  await new Promise((resolve, reject) => {
    const worker = new Worker(entry + probe, {
      workerData: {
        providerId: 'fixture-unknown-provider',
        userId: '12345678-1234-1234-1234-123456789abc',
      },
      env: {},
      execArgv: [],
      eval: true,
      resourceLimits: runtime.resourceLimits,
      stdout: true,
      stderr: true,
    });
    let settled = false;
    let applicationResponded = false;
    let providerLoaded = false;
    const timer = setTimeout(
      () => finish(new Error('AI worker entry timed out')),
      30000,
    );
    function finish(error) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      void worker.terminate();
      if (error) reject(error);
      else resolve();
    }
    worker.stdout.resume();
    worker.stderr.resume();
    worker.on('message', (message) => {
      if (message.type === 'error') applicationResponded = true;
      else if (message.type === 'fixture-loaded' && message.usable)
        providerLoaded = true;
      else
        return finish(
          new Error('Unexpected worker protocol or provider loader failure'),
        );
      if (applicationResponded && providerLoaded) finish();
    });
    worker.on('error', () =>
      finish(new Error('AI worker module failed to load')),
    );
    worker.on('exit', () =>
      finish(new Error('AI worker exited before its protocol response')),
    );
  });
}

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
        ? Promise.reject(new Error('Fixture injected OAuth failure'))
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
      assert.equal(method.available, true);
      assert.equal(method.reason, null);
      await productionCatalog.assertMethod(provider.id, method.type);
    }
  }
  const methods = { api_key: 0, oauth: 0 };
  for (const provider of publicCatalog.providers)
    for (const method of provider.methods) methods[method.type]++;
  assert.deepEqual(methods, { api_key: 41, oauth: 9 });
  const noOrigin = new AiCatalogService(
    { get: () => '' },
    { available: () => true },
  );
  assert.equal(
    (await noOrigin.assertMethod('openrouter', 'oauth')).id,
    'openrouter',
  );
  await assertWorkerEntry(
    join(__dirname, '../src/ai/ai-auth-worker-client.ts'),
  );
  await assertWorkerEntry(
    join(__dirname, '../dist/ai/ai-auth-worker-client.js'),
  );
  await assert.rejects(
    loginWithPi(
      'fixture-unknown-provider',
      '12345678-1234-1234-1234-123456789abc',
      {
        signal: AbortSignal.timeout(5000),
        notify: () => {
          throw new Error('Unexpected provider event');
        },
        prompt: () => Promise.reject(new Error('Unexpected provider prompt')),
      },
    ),
    /^Error: AI provider authentication failed$/,
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
      registryMethods: methods,
      injectedOAuthFailure: 'no-fallback',
      workerFailureBoundary: 'passed',
      workerEntryPoints: ['source', 'compiled'],
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
