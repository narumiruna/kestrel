// Offline security proof for the pinned, real provider adapters. Build first.
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs/promises');
const https = require('node:https');
const http = require('node:http');
const http2 = require('node:http2');
const { syncBuiltinESMExports } = require('node:module');
const threads = require('node:worker_threads');
const {
  PROVIDER_WORKER_ENV,
  isolatedProviderEnv,
  bedrockEndpoint,
  requireExplicitProviderKey,
  capProviderPayload,
} = require('../dist/route-assistant/route-assistant.provider-limits.js');
const {
  runVisualAgent,
} = require('../dist/route-assistant/route-assistant.agent.js');

const input = {
  request: 'Identify the visible target',
  loopTargetMeters: null,
  snapshot: {
    binding: { runId: 'fixture' },
    png: 'aW1hZ2U=',
    view: {
      width: 100,
      height: 100,
      mapRect: { left: 0, top: 0, width: 100, height: 90 },
    },
    visibleMarkers: [],
  },
};
const auth = {
  auth: { apiKey: 'fixture-user-bearer' },
  env: {
    AWS_REGION: 'eu-west-1',
    AWS_DEFAULT_REGION: 'us-east-2',
    AWS_PROFILE: 'host-profile',
    AWS_ACCESS_KEY_ID: 'host-access-key',
    AWS_SECRET_ACCESS_KEY: 'host-secret',
    AWS_BEDROCK_SKIP_AUTH: '1',
    HTTPS_PROXY: 'https://proxy.invalid',
    ...Object.fromEntries(
      Object.keys(PROVIDER_WORKER_ENV).map((name) => [
        name,
        'untrusted-override',
      ]),
    ),
  },
};
const profileReads = [];
const fixtureReadFile = async (filename) => {
  profileReads.push(String(filename));
  assert.ok(
    [
      '/dev/null',
      '/fixture/malicious-config',
      '/fixture/malicious-credentials',
    ].includes(String(filename)),
  );
  return '[default]\nregion = us-east-2\nendpoint_url = https://attacker.invalid\nmax_attempts = 7\naws_access_key_id = fixture-host-key\naws_secret_access_key = fixture-host-secret\n';
};
const selection = {
  providerId: 'anthropic',
  modelId: 'claude-haiku-4-5',
  modelType: 'chat',
  thinkingLevel: 'high',
  authMethod: 'api_key',
};

function helperTests() {
  const env = isolatedProviderEnv(auth);
  assert.deepEqual(env, PROVIDER_WORKER_ENV);
  assert.equal(
    bedrockEndpoint(auth),
    'https://bedrock-runtime.eu-west-1.amazonaws.com',
  );
  assert.equal(
    bedrockEndpoint({ ...auth, env: { AWS_REGION: 'cn-north-1' } }),
    'https://bedrock-runtime.cn-north-1.amazonaws.com.cn',
  );
  assert.equal(
    bedrockEndpoint({ ...auth, env: { AWS_REGION: 'us-gov-west-1' } }),
    'https://bedrock-runtime.us-gov-west-1.amazonaws.com',
  );
  for (const region of [
    '',
    'eu-west-1/evil',
    'https://evil.invalid',
    'EU-WEST-1',
  ])
    assert.throws(
      () => bedrockEndpoint({ ...auth, env: { AWS_REGION: region } }),
      /RA_PROVIDER_FAILED/,
    );
  for (const apiKey of ['', ' ', '<ADC>', '<>', 'gcp-vertex-credentials'])
    assert.throws(
      () => requireExplicitProviderKey('google-vertex', { auth: { apiKey } }),
      /RA_PROVIDER_FAILED/,
    );
  requireExplicitProviderKey('google-vertex', auth);
  requireExplicitProviderKey('kimi-coding', {
    auth: { headers: { Authorization: 'Bearer fixture-user-token' } },
  });
  assert.throws(() =>
    requireExplicitProviderKey('openai', {
      auth: { headers: { 'X-Not-Authentication': 'fixture' } },
    }),
  );

  const payload = {
    max_tokens: 32768,
    thinking: { type: 'enabled', budget_tokens: 16384 },
    nested: {
      max_completion_tokens: 50000,
      max_output_tokens: 50000,
      maxOutputTokens: 50000,
      maxTokens: 50000,
    },
    tools: [{ input_schema: { max_tokens: 999999 } }],
    messages: [{ max_tokens: 999999 }],
  };
  capProviderPayload(payload, 16384);
  assert.equal(payload.max_tokens, 16384);
  assert.equal(payload.thinking.budget_tokens, 15360);
  assert.ok(Object.values(payload.nested).every((value) => value === 16384));
  assert.equal(payload.tools[0].input_schema.max_tokens, 999999);
  assert.equal(payload.messages[0].max_tokens, 999999);
  for (const remaining of [0, 1, 1024, 2047])
    assert.throws(
      () =>
        capProviderPayload(
          {
            max_tokens: 32768,
            thinking: { type: 'enabled', budget_tokens: 16384 },
          },
          remaining,
        ),
      /RA_LIMIT/,
    );
  for (const value of [
    {},
    { tools: [{ max_tokens: 100 }] },
    { max_tokens: NaN },
    { max_tokens: '100' },
  ])
    assert.throws(() => capProviderPayload(value, 16384), /RA_LIMIT/);
  const google = {
    config: {
      maxOutputTokens: 32768,
      thinkingConfig: { thinkingBudget: 24000 },
    },
  };
  capProviderPayload(google, 4096);
  assert.equal(google.config.maxOutputTokens, 4096);
  assert.equal(google.config.thinkingConfig.thinkingBudget, 3072);
  const effort = { max_output_tokens: 32768, reasoning: { effort: 'high' } };
  capProviderPayload(effort, 4096);
  assert.equal(effort.reasoning.effort, 'high');
}

async function adapterTests(registry) {
  const context = {
    messages: [
      {
        role: 'user',
        content: [{ type: 'text', text: 'fixture' }],
        timestamp: 0,
      },
    ],
  };
  for (const [providerId, modelId, field] of [
    ['anthropic', 'claude-haiku-4-5', 'max_tokens'],
    ['amazon-bedrock', 'anthropic.claude-haiku-4-5-20251001-v1:0', 'maxTokens'],
  ]) {
    const provider = registry.getProvider(providerId);
    const model = registry.getModel(providerId, modelId);
    assert.ok(model, modelId);
    let seen = false;
    const stream = provider.streamSimple(model, context, {
      apiKey: auth.auth.apiKey,
      env: isolatedProviderEnv(auth),
      reasoning: 'high',
      maxTokens: 16384,
      maxRetries: 0,
      onPayload(payload) {
        seen = true;
        const config =
          field === 'maxTokens' ? payload.inferenceConfig : payload;
        const thinking =
          field === 'maxTokens'
            ? payload.additionalModelRequestFields.thinking
            : payload.thinking;
        // Prove that streamSimple increased the final provider request.
        assert.equal(config[field], 32768);
        assert.equal(thinking.budget_tokens, 16384);
        capProviderPayload(payload, 16384);
        assert.equal(config[field], 16384);
        assert.equal(thinking.budget_tokens, 15360);
        throw new Error('FIXTURE_STOP_BEFORE_HTTP');
      },
    });
    const result = await stream.result();
    assert.ok(seen, providerId);
    assert.equal(result.stopReason, 'error');
    assert.match(result.errorMessage, /FIXTURE_STOP_BEFORE_HTTP/);
  }

  // Exercise the agent-installed hook and aggregate remaining budget with a real adapter.
  const { fauxAssistantMessage } =
    await import('@earendil-works/pi-ai/providers/faux');
  const { AssistantMessageEventStream } =
    await import('@earendil-works/pi-ai/utils/event-stream');
  const firstMessage = {
    ...fauxAssistantMessage('continue'),
    usage: {
      input: 0,
      output: 15000,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 15000,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
  };
  let turns = 0;
  let finalHook = false;
  await assert.rejects(
    runVisualAgent(
      input,
      selection,
      auth,
      new AbortController().signal,
      () => {},
      (model, ctx, options) => {
        assert.equal(options.reasoning, 'high');
        assert.equal(typeof options.onPayload, 'function');
        if (++turns === 1) {
          const stream = new AssistantMessageEventStream();
          stream.push({ type: 'done', reason: 'stop', message: firstMessage });
          stream.end();
          return stream;
        }
        assert.equal(options.maxTokens, 1384);
        return registry.getProvider('anthropic').streamSimple(model, ctx, {
          ...options,
          onPayload(payload) {
            finalHook = true;
            // Legacy thinking cannot fit 1024 thinking + 1024 answer in 1384.
            return options.onPayload(payload, model);
          },
        });
      },
    ),
    /^Error: RA_LIMIT$/,
  );
  assert.equal(turns, 2);
  assert.ok(finalHook);
  let exhaustedTurns = 0;
  await assert.rejects(
    runVisualAgent(
      input,
      selection,
      auth,
      new AbortController().signal,
      () => {},
      () => {
        exhaustedTurns++;
        const stream = new AssistantMessageEventStream();
        stream.push({
          type: 'done',
          reason: 'stop',
          message: {
            ...firstMessage,
            usage: { ...firstMessage.usage, output: 16384, totalTokens: 16384 },
          },
        });
        stream.end();
        return stream;
      },
    ),
    /^Error: RA_LIMIT$/,
  );
  assert.equal(exhaustedTurns, 1);

  // Unknown payload formats must not issue an unbounded call.
  await assert.rejects(
    runVisualAgent(
      input,
      selection,
      auth,
      new AbortController().signal,
      () => {},
      (_model, _ctx, options) => {
        options.onPayload({ tools: [{ max_tokens: 16384 }] });
        throw new Error('unreachable');
      },
      registry.getModel('anthropic', selection.modelId),
    ),
    /^Error: RA_LIMIT$/,
  );
}

async function bedrockSdkTest(registry) {
  const {
    BedrockRuntimeClient,
    ConverseStreamCommand,
  } = require('@aws-sdk/client-bedrock-runtime');
  const {
    NodeHttp2Handler,
    NodeHttpHandler,
  } = require('@smithy/node-http-handler');
  const originalRead = fs.readFile;
  const originalSend = BedrockRuntimeClient.prototype.send;
  const originalHttp2 = NodeHttp2Handler.prototype.handle;
  const originalHttp = NodeHttpHandler.prototype.handle;
  const reads = profileReads;
  const requests = [];
  const attempts = [];
  const regions = [];
  // Do not call the real readFile: even /dev/null receives malicious fixture data.
  fs.readFile = fixtureReadFile;
  BedrockRuntimeClient.prototype.send = async function (...args) {
    attempts.push(await this.config.maxAttempts());
    regions.push(await this.config.region());
    return originalSend.apply(this, args);
  };
  const handle = async (request) => {
    requests.push(request);
    throw new Error('FIXTURE_STOP_BEFORE_HTTP');
  };
  NodeHttp2Handler.prototype.handle = handle;
  NodeHttpHandler.prototype.handle = handle;
  syncBuiltinESMExports();
  const fixedEnv = process.env;
  try {
    // Positive control: the same SDK accepts an endpoint and retries from a profile.
    // All file reads return fixture text; no real profile is opened.
    process.env = {
      ...PROVIDER_WORKER_ENV,
      AWS_CONFIG_FILE: '/fixture/malicious-config',
      AWS_SHARED_CREDENTIALS_FILE: '/fixture/malicious-credentials',
    };
    delete process.env.AWS_MAX_ATTEMPTS;
    delete process.env.AWS_IGNORE_CONFIGURED_ENDPOINT_URLS;
    const unsafe = new BedrockRuntimeClient({
      region: 'eu-west-1',
      token: { token: auth.auth.apiKey },
      authSchemePreference: ['httpBearerAuth'],
    });
    await assert.rejects(
      unsafe.send(
        new ConverseStreamCommand({
          modelId: 'fixture',
          messages: [{ role: 'user', content: [{ text: 'fixture' }] }],
        }),
      ),
      /FIXTURE_STOP_BEFORE_HTTP/,
    );
    assert.deepEqual(attempts, [7]);
    assert.equal(requests[0].hostname, 'attacker.invalid');
    assert.ok(reads.length > 0, 'SDK read only fixture profile data');
    unsafe.destroy();
    attempts.length = 0;
    regions.length = 0;
    requests.length = 0;
    process.env = fixedEnv;
    // Both normal registry IDs and an ARN with a different config region keep the endpoint.
    for (const arn of [false, true]) {
      const selected = registry.getModel(
        'amazon-bedrock',
        'anthropic.claude-haiku-4-5-20251001-v1:0',
      );
      const model = {
        ...selected,
        ...(arn
          ? {
              id: 'arn:aws:bedrock:us-east-2:123456789012:inference-profile/fixture',
            }
          : {}),
      };
      await assert.rejects(
        runVisualAgent(
          input,
          { ...selection, providerId: 'amazon-bedrock', modelId: model.id },
          {
            ...auth,
            auth: { ...auth.auth, baseUrl: 'https://attacker.invalid' },
          },
          new AbortController().signal,
          () => {},
          undefined,
          model,
        ),
        /^Error: RA_PROVIDER_FAILED$/,
      );
    }
    assert.deepEqual(attempts, [1, 1]);
    assert.deepEqual(regions, ['eu-west-1', 'us-east-2']);
    assert.equal(requests.length, 2);
    for (const request of requests) {
      assert.equal(request.hostname, 'bedrock-runtime.eu-west-1.amazonaws.com');
      assert.equal(request.protocol, 'https:');
      const headers = Object.fromEntries(
        Object.entries(request.headers).map(([name, value]) => [
          name.toLowerCase(),
          value,
        ]),
      );
      assert.equal(headers.authorization, 'Bearer fixture-user-bearer');
      assert.ok(!JSON.stringify(request.headers).includes('fixture-host-key'));
    }
    assert.ok(reads.length > 0, 'SDK attempted fixture config reads');
  } finally {
    process.env = fixedEnv;
    fs.readFile = originalRead;
    BedrockRuntimeClient.prototype.send = originalSend;
    NodeHttp2Handler.prototype.handle = originalHttp2;
    NodeHttpHandler.prototype.handle = originalHttp;
    syncBuiltinESMExports();
  }
}

async function workerTests() {
  const originalWorker = threads.Worker;
  const observed = [];
  threads.Worker = class extends originalWorker {
    constructor(entry, options) {
      assert.deepEqual(options.env, PROVIDER_WORKER_ENV);
      assert.deepEqual(options.execArgv, []);
      assert.ok(
        [128, 256].includes(options.resourceLimits.maxOldGenerationSizeMb),
      );
      const body = options.eval ? entry : `require(${JSON.stringify(entry)});`;
      super(
        `require('node:worker_threads').parentPort.postMessage({type:'fixture-env',env:process.env});${body}`,
        { ...options, eval: true },
      );
      this.on('message', (message) => {
        if (message.type === 'fixture-env') observed.push(message.env);
      });
    }
  };
  try {
    require('ts-node').register({
      transpileOnly: true,
      project: path.join(__dirname, '../tsconfig.json'),
    });
    for (const extension of ['ts', 'js']) {
      const directory = extension === 'ts' ? 'src' : 'dist';
      const client = require(
        `../${directory}/route-assistant/route-assistant.worker-client.${extension}`,
      );
      const runtime = client.assistantWorkerRuntime();
      assert.equal(
        runtime.resourceLimits.maxOldGenerationSizeMb,
        extension === 'ts' ? 256 : 128,
      );
      await assert.rejects(
        client.runAssistantWorker(
          input,
          { ...selection, modelType: 'classifier' },
          auth,
          new AbortController().signal,
          () => {},
        ),
        /^Error: RA_MODEL_UNSUPPORTED$/,
      );
      // Placeholder auth is rejected before Vertex can select ADC.
      await assert.rejects(
        client.runAssistantWorker(
          input,
          {
            ...selection,
            providerId: 'google-vertex',
            modelId: 'gemini-2.5-flash',
          },
          { auth: { apiKey: '<ADC>' } },
          new AbortController().signal,
          () => {},
        ),
        /^Error: RA_PROVIDER_FAILED$/,
      );
    }
    assert.equal(observed.length, 4);
    for (const env of observed) assert.deepEqual(env, PROVIDER_WORKER_ENV);
  } finally {
    threads.Worker = originalWorker;
  }
}

async function main() {
  assert.equal(process.versions.node.split('.')[0], '22');
  helperTests();
  const originalEnv = process.env;
  const originalReadFile = fs.readFile;
  fs.readFile = fixtureReadFile;
  const originals = {
    fetch: globalThis.fetch,
    httpsRequest: https.request,
    httpRequest: http.request,
    connect: http2.connect,
  };
  let network = 0;
  const forbidden = () => {
    network++;
    throw new Error('FIXTURE_NETWORK_FORBIDDEN');
  };
  globalThis.fetch = forbidden;
  https.request = forbidden;
  http.request = forbidden;
  http2.connect = forbidden;
  // SDKs use the same fixed environment as the actual worker; no ambient inheritance.
  process.env = { ...PROVIDER_WORKER_ENV };
  syncBuiltinESMExports();
  try {
    const { builtinModels } =
      await import('@earendil-works/pi-ai/providers/all');
    const registry = builtinModels({
      authContext: {
        env: async () => undefined,
        fileExists: async () => false,
      },
    });
    await adapterTests(registry);
    await bedrockSdkTest(registry);
    process.env = {
      ...PROVIDER_WORKER_ENV,
      AWS_PROFILE: 'malicious-parent',
      HTTPS_PROXY: 'https://parent.invalid',
      AWS_ACCESS_KEY_ID: 'parent-secret',
    };
    await workerTests();
    assert.equal(network, 0);
    console.log(
      'Offline provider final-payload limits, Bedrock endpoint/retry/file controls, and source/compiled Node 22 worker tests passed',
    );
  } finally {
    process.env = originalEnv;
    fs.readFile = originalReadFile;
    globalThis.fetch = originals.fetch;
    https.request = originals.httpsRequest;
    http.request = originals.httpRequest;
    http2.connect = originals.connect;
    syncBuiltinESMExports();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
