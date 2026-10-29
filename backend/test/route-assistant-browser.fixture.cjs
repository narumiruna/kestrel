// Offline production-UI verification fixture; Node 22, build first:
// cd backend && npm run build && node test/route-assistant-browser.fixture.cjs
// cd web && KESTREL_API_BASE_URL=http://127.0.0.1:4330 npm run dev -- --webpack
// CDP: seed localStorage['kestrel.web.session'] with GET /__fixture's session.
// Intercept *tile.openstreetmap.org* through CDP Fetch and fulfill from
// http://127.0.0.1:4330/__fixture/tile.png. Never fetch real tiles.
// POST /__fixture accepts pointCount: 2|50|1000, mode: proposal|remove-events|
// unclear|ambiguous|offscreen|unsupported, delayMs: 0..10000, saveFailure: boolean,
// modelType: chat|image|classifier, imageInput: boolean, settingsGeneration: integer.
// Reset via POST /__fixture {pointCount:2,mode:'proposal',delayMs:500,
// saveFailure:false,modelType:'chat',imageInput:true,settingsGeneration:2}.
// Reload the editor after changing pointCount. Restart to clear service rate limits
// (the real service permits four starts per minute). No prompts/images are logged.
'use strict';

const assert = require('node:assert/strict');
const { deflateSync } = require('node:zlib');
const { setTimeout: delay } = require('node:timers/promises');
const { Hono } = require('hono');
const { serve } = require('@hono/node-server');
const {
  RouteAssistantService,
} = require('../dist/route-assistant/route-assistant.service.js');
const {
  createRouteAssistantRoutes,
} = require('../dist/route-assistant/route-assistant.routes.js');
const {
  runVisualAgent,
} = require('../dist/route-assistant/route-assistant.agent.js');
const { piRegistry } = require('../dist/ai/ai-catalog.js');
const {
  createAssistantProposal,
} = require('../dist/route-assistant/route-assistant.geometry.js');
const { enforceBodyLimit } = require('../dist/http/handlers.js');

const USER = '11111111-1111-4111-8111-111111111111';
const SESSION = '22222222-2222-4222-8222-222222222222';
const ROUTE = '33333333-3333-4333-8333-333333333333';
const KEY = 'private-fixture-only-key';
const TOKEN = 'fixture-browser-access';
const REFRESH = 'fixture-browser-refresh';
const session = {
  accessToken: TOKEN,
  accessTokenExpiresAt: '2099-01-01T00:00:00.000Z',
  refreshToken: REFRESH,
  session: { id: SESSION },
  user: { id: USER, username: 'fixtureuser' },
};
const config = {
  pointCount: 2,
  mode: 'proposal',
  delayMs: 500,
  saveFailure: false,
  saveDelayMs: 0,
  modelType: 'chat',
  imageInput: true,
  settingsGeneration: 2,
};
const metrics = {
  aiRuns: 0,
  stops: 0,
  saves: 0,
  requests: 0,
  streamCalls: 0,
  abortedRuns: 0,
  imageVerification: null,
  privacyVerified: false,
  lastFakeSavedRoute: null,
};

function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++)
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const name = Buffer.from(type);
  const size = Buffer.alloc(4);
  size.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([size, name, data, crc]);
}
function makeTile() {
  const width = 256,
    height = 256;
  const raw = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const road = x % 48 < 7 || y % 48 < 7;
      const label = x % 48 > 12 && x % 48 < 32 && y % 48 > 12 && y % 48 < 16;
      const water = x > 185 && x < 220;
      const park = x > 55 && x < 95 && y > 55 && y < 95;
      const rgb = road
        ? [255, 255, 255]
        : label
          ? [145, 151, 158]
          : water
            ? [176, 208, 226]
            : park
              ? [200, 219, 190]
              : [230, 232, 228];
      const index = y * (1 + width * 3) + 1 + x * 3;
      raw.set(rgb, index);
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
const tile = makeTile();

function makeRoute(count) {
  const stamp = '2026-01-01T00:00:00.000Z';
  const waypoints = Array.from({ length: count }, (_, index) => {
    // A small visible Taipei circle. Two-point fixture is a diagonal.
    const angle = (2 * Math.PI * index) / Math.max(1, count - 1);
    return {
      latitude:
        count === 2
          ? 25.033 + index * 0.003
          : 25.0345 + Math.sin(angle) * 0.003,
      longitude:
        count === 2
          ? 121.562 + index * 0.004
          : 121.564 + Math.cos(angle) * 0.003,
      sequence: index,
      speedKmh: index === 0 ? 5 : null,
      pauseSeconds: index === 0 ? 2 : null,
    };
  });
  return {
    id: ROUTE,
    name: `Taipei fixture ${count}`,
    description: 'Offline visual verification',
    createdAt: stamp,
    updatedAt: stamp,
    deletedAt: null,
    isPublic: false,
    mode: 'ONCE',
    defaultSpeedKmh: 15,
    libraryItem: {
      id: '44444444-4444-4444-8444-444444444444',
      kind: 'ROUTE',
      routeId: ROUTE,
      placeId: null,
      createdAt: stamp,
      updatedAt: stamp,
      deletedAt: null,
      lastUsedAt: null,
      pinned: false,
      sortOrder: 0,
    },
    currentRevision: {
      id: '55555555-5555-4555-8555-555555555555',
      revisionNumber: 1,
      createdAt: stamp,
      createdBy: USER,
      mode: 'ONCE',
      defaultSpeedKmh: 15,
      waypoints,
    },
  };
}
let route = makeRoute(2);
const selection = () => ({
  providerId: 'openai',
  modelId: 'gpt-4o',
  authMethod: 'api_key',
  modelType: config.modelType,
  thinkingLevel: 'off',
});
const settingsValue = () => ({
  generation: config.settingsGeneration,
  selection: selection(),
  connectionGenerations: { openai: 3 },
  connections: [
    {
      providerId: 'openai',
      authMethod: 'api_key',
      generation: 3,
      status: 'connected',
    },
  ],
});

async function main() {
  assert.equal(
    process.versions.node.split('.')[0],
    '22',
    'Run this fixture with Node 22',
  );
  // Deny all outbound traffic, including accidental SDK fallbacks. Listening is unaffected.
  const denied = () => {
    throw new Error('Fixture forbids outbound network');
  };
  globalThis.fetch = denied;
  for (const name of ['node:http', 'node:https']) {
    require(name).request = denied;
    require(name).get = denied;
  }
  require('node:net').Socket.prototype.connect = denied;
  require('node:tls').connect = denied;
  const { createFauxCore, fauxAssistantMessage, fauxToolCall } =
    await import('@earendil-works/pi-ai/providers/faux');
  const registry = await piRegistry();
  const realModel = registry.models.getModel('openai', 'gpt-4o');
  assert.ok(
    realModel?.input.includes('image'),
    'Build/install current pi-ai metadata first',
  );
  const catalogValue = () => ({
    version: 'fixture',
    providers: [
      {
        id: 'openai',
        name: 'OpenAI (offline fixture)',
        methods: [{ type: 'api_key', available: true, reason: null }],
        fields: [],
        models: [
          {
            id: realModel.id,
            name: realModel.name,
            type: config.modelType,
            imageInput: config.imageInput,
            thinkingLevels: ['off'],
          },
        ],
      },
    ],
  });
  const catalog = {
    catalog: async () => catalogValue(),
    selection: async (value) => {
      assert.deepEqual(value, selection());
      return value;
    },
    assertMethod: async (provider, method) => {
      assert.equal(provider, 'openai');
      assert.equal(method, 'api_key');
      return catalogValue().providers[0];
    },
  };
  const credentialStore = {
    assertSession: async () => {},
    read: async (provider, options) => {
      options?.signal?.throwIfAborted();
      assert.equal(provider, 'openai');
      return { type: 'api_key', key: KEY };
    },
    list: async () => [{ providerId: 'openai', type: 'api_key' }],
    modify: async (provider, fn, options) => {
      options?.signal?.throwIfAborted();
      assert.equal(provider, 'openai');
      return fn({ type: 'api_key', key: KEY });
    },
  };
  const fakeSettings = {
    settings: async (user, sessionId) => {
      assert.equal(user, USER);
      assert.equal(sessionId, SESSION);
      return settingsValue();
    },
    catalog,
    store: (user, sessionId) => {
      assert.equal(user, USER);
      assert.equal(sessionId, SESSION);
      return credentialStore;
    },
  };
  const fakePrisma = {
    route: {
      findFirst: async (query) => {
        assert.deepEqual(query, {
          where: { id: ROUTE, userId: USER, deletedAt: null },
          select: { id: true },
        });
        return { id: ROUTE };
      },
    },
  };
  const worker = async (input, savedSelection, auth, signal, emit) => {
    metrics.aiRuns++;
    try {
      assert.equal(auth.auth.apiKey, KEY);
      await delay(config.delayMs, undefined, { signal });
      const keyword = input.request.slice(0, 2000).toLowerCase();
      const reason = ['unclear', 'ambiguous', 'offscreen', 'unsupported'].find(
        (word) =>
          config.mode === word || new RegExp(`\\b${word}\\b`).test(keyword),
      );
      const removeEvents =
        config.mode === 'remove-events' || /\bremove-events\b/.test(keyword);
      const known = new Map(
        input.snapshot.waypoints.map((point) => [point.draftId, point]),
      );
      const references = input.snapshot.visibleMarkers.filter((marker) => {
        const point = known.get(marker.draftId);
        return (
          point &&
          !(
            removeEvents &&
            (point.speedKmh !== null || point.pauseSeconds !== null)
          )
        );
      });
      // Move visible references in image space, preserving their known event fields.
      // Keep faux tool output within the real 16384-token Agent budget even
      // when the editor contains 1000 long draft IDs.
      let points = references.slice(0, 96).map((marker) => ({
        kind: 'image',
        draftId: marker.draftId,
        u: Math.min(0.98, Math.max(0.02, marker.u + 0.015)),
        v: Math.min(0.98, Math.max(0.02, marker.v + 0.015)),
      }));
      if (!removeEvents) {
        const used = new Set(points.map((point) => point.draftId));
        for (const point of input.snapshot.waypoints) {
          if (
            !used.has(point.draftId) &&
            (point.speedKmh !== null || point.pauseSeconds !== null) &&
            points.length < 98
          )
            points.unshift({ kind: 'retain', draftId: point.draftId });
        }
      }
      if (/\bdense\b/.test(keyword)) {
        points = [];
        for (const original of input.snapshot.waypoints) {
          if (original.speedKmh !== null || original.pauseSeconds !== null)
            points.push({ kind: 'retain', draftId: original.draftId });
        }
        while (points.length < config.pointCount) {
          const n = points.length;
          points.push({
            kind: 'image',
            u: Number((0.2 + (0.6 * n) / config.pointCount).toFixed(3)),
            v: Number((0.5 + 0.2 * Math.sin(n / 8)).toFixed(3)),
          });
        }
      }
      if (/\bwide\b/.test(keyword))
        points = [
          { kind: 'image', u: 0.9, v: 0.5 },
          { kind: 'image', u: 0.95, v: 0.55 },
        ];
      if (/\bloop-success\b/.test(keyword)) {
        const square = (half) => [
          { kind: 'image', u: 0.5 - half, v: 0.5 - half },
          { kind: 'image', u: 0.5 + half, v: 0.5 - half },
          { kind: 'image', u: 0.5 + half, v: 0.5 + half },
          { kind: 'image', u: 0.5 - half, v: 0.5 + half },
          { kind: 'image', u: 0.5 - half, v: 0.5 - half },
        ];
        let low = 0,
          high = 0.45;
        for (let attempt = 0; attempt < 32; attempt++) {
          const half = (low + high) / 2;
          const distance = createAssistantProposal(
            { ...input, loopTargetMeters: null },
            square(half),
          ).distanceMeters;
          if (distance < input.loopTargetMeters) low = half;
          else high = half;
        }
        points = square((low + high) / 2);
      }
      while (points.length < 2)
        points.push({
          kind: 'image',
          u: 0.35 + points.length * 0.2,
          v: 0.45 + points.length * 0.1,
        });
      const core = createFauxCore({
        provider: 'fixture',
        models: [{ id: 'vision', input: ['text', 'image'] }],
      });
      core.setResponses([
        fauxAssistantMessage([
          reason
            ? fauxToolCall(
                'ask_for_clarification',
                { reason },
                { id: 'fixture-call' },
              )
            : fauxToolCall('submit_path', { points }, { id: 'fixture-call' }),
        ]),
      ]);
      const stream = (model, context, options) => {
        metrics.streamCalls++;
        if (/\boutage\b/.test(keyword))
          throw new Error('fixture provider unavailable');
        const images = context.messages
          .filter((message) => message.role === 'user')
          .flatMap((message) =>
            Array.isArray(message.content) ? message.content : [],
          )
          .filter((block) => block.type === 'image');
        assert.equal(images.length, 1);
        assert.equal(images[0].mimeType, 'image/png');
        assert.equal(images[0].data, input.snapshot.png);
        const png = Buffer.from(images[0].data, 'base64');
        assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
        metrics.imageVerification = {
          count: 1,
          mimeType: 'image/png',
          bytes: png.length,
          width: png.readUInt32BE(16),
          height: png.readUInt32BE(20),
          matchesSnapshot: true,
        };
        const serialized = JSON.stringify(context);
        for (const secret of [KEY, TOKEN, REFRESH, USER, SESSION])
          assert.ok(!serialized.includes(secret));
        assert.equal(options.apiKey, KEY);
        metrics.privacyVerified = true;
        return core.streamSimple(model, context, options);
      };
      // Real registry metadata/auth path above; only the inference stream is faux.
      await runVisualAgent(input, savedSelection, auth, signal, emit, stream);
    } finally {
      if (signal.aborted) metrics.abortedRuns++;
    }
  };
  const service = new RouteAssistantService(fakeSettings, fakePrisma, worker);
  const app = new Hono();
  app.use('*', enforceBodyLimit);
  app.use('*', async (context, next) => {
    metrics.requests++;
    const origin = context.req.header('origin');
    if (origin && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin))
      return context.json({ code: 'FIXTURE_ORIGIN_DENIED' }, 403);
    if (origin) context.header('Access-Control-Allow-Origin', origin);
    context.header(
      'Access-Control-Allow-Headers',
      'Authorization, Content-Type',
    );
    context.header(
      'Access-Control-Allow-Methods',
      'GET, POST, PATCH, DELETE, OPTIONS',
    );
    context.header('Vary', 'Origin');
    context.header('Cache-Control', 'no-store');
    if (context.req.method === 'OPTIONS') return context.body(null, 204);
    if (
      context.req.method === 'DELETE' &&
      /^\/ai\/route-assistant\/runs\/[^/]+$/.test(context.req.path)
    )
      metrics.stops++;
    await next();
  });
  app.get('/__fixture', (context) =>
    context.json({ ...metrics, config, session, routeId: ROUTE }),
  );
  app.get('/__fixture/tile.png', (context) =>
    context.body(tile, 200, { 'Content-Type': 'image/png' }),
  );
  app.post('/__fixture', async (context) => {
    const value = await context.req.json();
    const allowed = Object.keys(config);
    if (
      !value ||
      Array.isArray(value) ||
      Object.keys(value).some((key) => !allowed.includes(key))
    )
      return context.json({ code: 'FIXTURE_INVALID_CONFIG' }, 400);
    const next = { ...config, ...value };
    if (
      ![2, 50, 1000].includes(next.pointCount) ||
      ![
        'proposal',
        'remove-events',
        'unclear',
        'ambiguous',
        'offscreen',
        'unsupported',
      ].includes(next.mode) ||
      !Number.isInteger(next.delayMs) ||
      next.delayMs < 0 ||
      next.delayMs > 10000 ||
      typeof next.saveFailure !== 'boolean' ||
      !Number.isInteger(next.saveDelayMs) ||
      next.saveDelayMs < 0 ||
      next.saveDelayMs > 10000 ||
      !['chat', 'image', 'classifier'].includes(next.modelType) ||
      typeof next.imageInput !== 'boolean' ||
      !Number.isSafeInteger(next.settingsGeneration) ||
      next.settingsGeneration < 0
    )
      return context.json({ code: 'FIXTURE_INVALID_CONFIG' }, 400);
    Object.assign(config, next);
    if ('pointCount' in value) {
      route = makeRoute(config.pointCount);
      metrics.lastFakeSavedRoute = null;
    }
    return context.json({ ok: true, config });
  });
  app.post('/auth/refresh', async (context) => {
    const body = await context.req.json();
    return body.refreshToken === REFRESH
      ? context.json(session)
      : context.json({ code: 'FIXTURE_AUTH_REQUIRED' }, 401);
  });
  const sessionAuth = async (context, next) => {
    if (context.req.header('authorization') !== `Bearer ${TOKEN}`)
      return context.json({ code: 'FIXTURE_AUTH_REQUIRED' }, 401);
    context.set('auth', { userId: USER, sessionId: SESSION });
    await next();
  };
  app.use('/places', sessionAuth);
  app.use('/routes', sessionAuth);
  app.use('/routes/*', sessionAuth);
  app.use('/ai/settings', sessionAuth);
  app.use('/ai/catalog', sessionAuth);
  app.use('/devices', sessionAuth);
  app.get('/places', (context) => context.json([]));
  app.get('/routes', (context) => context.json([route]));
  app.get('/routes/:id', (context) =>
    context.req.param('id') === ROUTE
      ? context.json(route)
      : context.json({ code: 'FIXTURE_UNKNOWN_ROUTE' }, 404),
  );
  app.get('/ai/settings', (context) => context.json(settingsValue()));
  app.get('/ai/catalog', (context) => context.json(catalogValue()));
  app.get('/devices', (context) => context.json({ devices: [] }));
  app.patch('/routes/:id', async (context) => {
    if (context.req.param('id') !== ROUTE)
      return context.json({ code: 'FIXTURE_UNKNOWN_ROUTE' }, 404);
    metrics.saves++;
    if (config.saveDelayMs) await delay(config.saveDelayMs);
    if (config.saveFailure)
      return context.json(
        {
          code: 'FIXTURE_SAVE_FAILED',
          message: 'Offline fixture save failure',
        },
        503,
      );
    const body = await context.req.json();
    if (
      !Array.isArray(body.waypoints) ||
      body.waypoints.length < 2 ||
      body.waypoints.length > 1000 ||
      body.waypoints.some(
        (p) => !Number.isFinite(p.latitude) || !Number.isFinite(p.longitude),
      )
    )
      return context.json({ code: 'FIXTURE_INVALID_ROUTE' }, 400);
    const revisionNumber = route.currentRevision.revisionNumber + 1;
    const stamp = new Date().toISOString();
    const waypoints = body.waypoints.map((p, sequence) => ({
      latitude: p.latitude,
      longitude: p.longitude,
      speedKmh: p.speedKmh ?? null,
      pauseSeconds: p.pauseSeconds ?? null,
      sequence,
    }));
    route = {
      ...route,
      name: body.name,
      description: body.description ?? null,
      mode: body.mode,
      defaultSpeedKmh: body.defaultSpeedKmh,
      isPublic: body.isPublic,
      updatedAt: stamp,
      libraryItem: { ...route.libraryItem, updatedAt: stamp },
      currentRevision: {
        id: `55555555-5555-4555-8555-${String(revisionNumber).padStart(12, '0')}`,
        revisionNumber,
        createdAt: stamp,
        createdBy: USER,
        mode: body.mode,
        defaultSpeedKmh: body.defaultSpeedKmh,
        waypoints,
      },
    };
    metrics.lastFakeSavedRoute = structuredClone(route);
    return context.json(route);
  });
  app.route('/', createRouteAssistantRoutes(service, sessionAuth));
  app.notFound((context) =>
    context.json({ code: 'FIXTURE_UNRECOGNIZED_REQUEST' }, 404),
  );
  app.onError((_error, context) =>
    context.json({ code: 'FIXTURE_REQUEST_FAILED' }, 500),
  );
  const server = serve(
    { fetch: app.fetch, hostname: '127.0.0.1', port: 4330 },
    () => {
      console.log(
        'Offline RouteAssistant fixture listening at http://127.0.0.1:4330',
      );
    },
  );
  server.on('error', () => {
    console.error(
      'Fixture listen failed. Free 127.0.0.1:4330, build backend with Node 22, then rerun this file.',
    );
    process.exitCode = 1;
  });
  for (const event of ['SIGINT', 'SIGTERM'])
    process.once(event, () => server.close(() => process.exit(0)));
}
main().catch(() => {
  console.error(
    'Fixture startup failed. Use Node 22; cd backend && npm run build && node test/route-assistant-browser.fixture.cjs. No network or database is required.',
  );
  process.exitCode = 1;
});
