import { piRegistry, type AiSelection } from '../ai/ai-catalog';
import { aiError } from '../ai/ai-errors';
import type { AiSettingsService } from '../ai/ai-settings.service';
import { createUserAiModels } from '../ai/ai-user-models';
import type { PrismaService } from '../prisma/prisma.service';
import { fixtureInput } from './route-assistant.fixture';
import { createAssistantProposal } from './route-assistant.geometry';
import {
  type AssistantEvent,
  ROUTE_ASSISTANT_LIMITS as L,
} from './route-assistant.models';
import { RouteAssistantService } from './route-assistant.service';

jest.mock('../ai/ai-catalog', () => ({ piRegistry: jest.fn() }));
jest.mock('../ai/ai-user-models', () => ({ createUserAiModels: jest.fn() }));

type Worker = NonNullable<
  ConstructorParameters<typeof RouteAssistantService>[2]
>;
const secret = 'fake-secret-must-never-leave-backend';
function input(userId = 'user', sessionId = 'session', runId = 'run') {
  const value = fixtureInput();
  Object.assign(value.snapshot.binding, {
    userId,
    sessionId,
    runId,
    routeId: 'new:00000000-0000-0000-0000-000000000001',
  });
  value.snapshot.capturedAt = Date.now();
  return value;
}
async function events(
  stream: ReadableStream<Uint8Array>,
): Promise<AssistantEvent[]> {
  const text = await new Response(stream).text();
  expect(text).not.toContain(secret);
  return text
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as AssistantEvent);
}
function setup() {
  const selection: AiSelection = {
    providerId: 'p',
    modelId: 'model',
    modelType: 'chat',
    authMethod: 'api_key',
    thinkingLevel: null,
  };
  const value = {
    selection: selection as AiSelection | null,
    generation: 2,
    connectionGenerations: { p: 3 },
    connections: [
      { providerId: 'p', status: 'connected', authMethod: 'api_key' },
    ],
  };
  const catalog = {
    providers: [
      { id: 'p', models: [{ id: 'model', type: 'chat', imageInput: true }] },
    ],
  };
  const assertSession = jest.fn((userId: string, sessionId: string) => {
    if (sessionId !== `session${userId === 'user' ? '' : `-${userId}`}`)
      aiError('AI_SESSION_EXPIRED', 401);
    return Promise.resolve();
  });
  const store = jest.fn((userId: string, sessionId: string) => ({
    assertSession: () => assertSession(userId, sessionId),
  }));
  const settings = {
    settings: jest.fn(async (userId: string, sessionId: string) => {
      await assertSession(userId, sessionId);
      return value;
    }),
    store,
    catalog: {
      selection: jest.fn((selected: AiSelection | null) =>
        Promise.resolve(selected),
      ),
      catalog: jest.fn(() => Promise.resolve(catalog)),
    },
  };
  const prisma = {
    route: {
      findFirst: jest.fn((args: { where: { userId: string } }) =>
        Promise.resolve(args.where.userId === 'user' ? { id: 'saved' } : null),
      ),
      create: jest.fn(),
      update: jest.fn(),
    },
    device: { findMany: jest.fn() },
    remoteCommand: { create: jest.fn() },
    place: { findMany: jest.fn() },
  };
  const getModel = jest.fn(() => ({ input: ['text', 'image'] }));
  jest.mocked(piRegistry).mockResolvedValue({ models: { getModel } } as never);
  const getAuth = jest.fn(() => Promise.resolve({ auth: { apiKey: secret } }));
  jest.mocked(createUserAiModels).mockResolvedValue({ getAuth } as never);
  const worker = jest.fn<ReturnType<Worker>, Parameters<Worker>>(
    (request, _selection, _auth, _signal, emit) => {
      emit({
        binding: request.snapshot.binding,
        type: 'proposal',
        proposal: createAssistantProposal(request, [
          { kind: 'retain', draftId: 'a' },
          { kind: 'retain', draftId: 'b' },
        ]),
      });
      return Promise.resolve();
    },
  );
  const service = new RouteAssistantService(
    settings as unknown as AiSettingsService,
    prisma as unknown as PrismaService,
    worker,
  );
  const start = (request = input(), signal = new AbortController().signal) =>
    service.start(
      request.snapshot.binding.userId,
      request.snapshot.binding.sessionId,
      request,
      signal,
    );
  function pending() {
    let release!: () => void;
    const done = new Promise<void>((resolve) => {
      release = resolve;
    });
    let signal!: AbortSignal;
    worker.mockImplementation(async (_request, _selection, _auth, abort) => {
      signal = abort;
      await done;
    });
    return { release, signal: () => signal };
  }
  return {
    service,
    start,
    worker,
    pending,
    value,
    catalog,
    settings,
    prisma,
    getModel,
    getAuth,
    selection,
  };
}

describe('RouteAssistantService safety (no database, network, or inference)', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('releases the run reservation when a settings read stalls beyond the deadline', async () => {
    jest.useFakeTimers();
    const h = setup();
    h.settings.settings.mockImplementationOnce(
      () => new Promise<never>(() => {}),
    );
    const rejected = expect(h.start()).rejects.toThrow('RA_TIMEOUT');
    await jest.advanceTimersByTimeAsync(L.runMs + 1);
    await rejected;
    const output = await events(
      await h.start(input('user', 'session', 'after-timeout')),
    );
    expect(output.some((event) => event.type === 'proposal')).toBe(true);
  });

  it('uses only the owner configuration and credentials without persistence or device calls', async () => {
    const h = setup();
    const output = await events(await h.start());
    expect(output.map((event) => event.type)).toEqual([
      'status',
      'proposal',
      'done',
    ]);
    expect(h.getModel).toHaveBeenCalledWith('p', 'model');
    expect(h.settings.store).toHaveBeenCalledWith('user', 'session');
    expect(h.worker.mock.calls[0][2]).toEqual({ auth: { apiKey: secret } });
    expect(h.prisma.route.findFirst).not.toHaveBeenCalled();
    for (const mock of [
      h.prisma.route.create,
      h.prisma.route.update,
      h.prisma.device.findMany,
      h.prisma.remoteCommand.create,
      h.prisma.place.findMany,
    ])
      expect(mock).not.toHaveBeenCalled();
  });

  it.each(['userId', 'sessionId'] as const)(
    'rejects a forged %s before resolving credentials',
    async (field) => {
      const h = setup();
      const request = input();
      request.snapshot.binding[field] = 'other';
      await expect(
        h.service.start(
          'user',
          'session',
          request,
          new AbortController().signal,
        ),
      ).rejects.toThrow('RA_OWNER_MISMATCH');
      expect(h.settings.settings).not.toHaveBeenCalled();
      expect(h.worker).not.toHaveBeenCalled();
    },
  );

  it('cannot cancel another owner or session and checks session validity', async () => {
    const h = setup();
    const pending = h.pending();
    const stream = await h.start();
    await expect(h.service.cancel('bob', 'session-bob', 'run')).rejects.toThrow(
      'RA_RUN_NOT_FOUND',
    );
    await expect(
      h.service.cancel('user', 'session-other', 'run'),
    ).rejects.toThrow('AI_SESSION_EXPIRED');
    expect(pending.signal().aborted).toBe(false);
    await expect(h.service.cancel('user', 'session', 'run')).resolves.toEqual({
      ok: true,
    });
    expect(pending.signal().aborted).toBe(true);
    pending.release();
    expect(await events(stream)).toContainEqual(
      expect.objectContaining({ type: 'error', code: 'RA_CANCELLED' }),
    );
  });

  it('queries saved routes with owner and deletion constraints, and rejects another owner', async () => {
    const h = setup();
    const request = input();
    request.snapshot.binding.routeId = '00000000-0000-0000-0000-000000000001';
    await events(await h.start(request));
    expect(h.prisma.route.findFirst).toHaveBeenCalledWith({
      where: {
        id: request.snapshot.binding.routeId,
        userId: 'user',
        deletedAt: null,
      },
      select: { id: true },
    });
    const other = input('bob', 'session-bob');
    other.snapshot.binding.routeId = request.snapshot.binding.routeId;
    await expect(h.start(other)).rejects.toThrow('RA_ROUTE_NOT_FOUND');
    expect(h.worker).toHaveBeenCalledTimes(1);
  });

  it.each([
    'missing selection',
    'non-chat',
    'missing connection',
    'disconnected',
    'catalog text-only',
    'registry text-only',
    'missing auth',
    'settings generation',
    'connection generation',
  ])('rejects %s before worker execution', async (kind) => {
    const h = setup();
    if (kind === 'missing selection') h.value.selection = null;
    if (kind === 'non-chat') h.selection.modelType = 'image';
    if (kind === 'missing connection') h.value.connections = [];
    if (kind === 'disconnected') h.value.connections[0].status = 'disconnected';
    if (kind === 'catalog text-only')
      h.catalog.providers[0].models[0].imageInput = false;
    if (kind === 'registry text-only')
      h.getModel.mockReturnValue({ input: ['text'] });
    if (kind === 'missing auth')
      h.getAuth.mockResolvedValue({ auth: { apiKey: '' } });
    if (kind === 'settings generation') h.value.generation++;
    if (kind === 'connection generation') h.value.connectionGenerations.p++;
    await expect(h.start()).rejects.toThrow(/^RA_/);
    expect(h.worker).not.toHaveBeenCalled();
  });

  it('rejects duplicate active and completed run IDs without a paid retry', async () => {
    const h = setup();
    const pending = h.pending();
    const stream = await h.start();
    await expect(h.start()).rejects.toThrow('RA_DUPLICATE_RUN');
    pending.release();
    await events(stream);
    await expect(h.start()).rejects.toThrow('RA_DUPLICATE_RUN');
    expect(h.worker).toHaveBeenCalledTimes(1);
  });

  it('limits concurrent runs per user and globally', async () => {
    const h = setup();
    const pending = h.pending();
    const streams = [await h.start()];
    await expect(h.start(input('user', 'session', 'second'))).rejects.toThrow(
      'RA_BUSY',
    );
    for (let i = 1; i < L.concurrentRuns; i++)
      streams.push(await h.start(input(`u${i}`, `session-u${i}`)));
    await expect(
      h.start(input('overflow', 'session-overflow')),
    ).rejects.toThrow('RA_BUSY');
    pending.release();
    await Promise.all(streams.map(events));
  });

  it('limits starts per minute even after successful completion', async () => {
    const h = setup();
    for (let i = 0; i < L.startsPerMinute; i++)
      await events(await h.start(input('user', 'session', `run-${i}`)));
    await expect(h.start()).rejects.toThrow('RA_BUSY');
    expect(h.worker).toHaveBeenCalledTimes(L.startsPerMinute);
  });

  it('bounds retained run identities across users', async () => {
    const h = setup();
    for (let i = 0; i < 256; i++)
      await events(await h.start(input(`u${i}`, `session-u${i}`)));
    await expect(h.start()).rejects.toThrow('RA_BUSY');
  });

  it('propagates request abort to the worker and suppresses late results', async () => {
    const h = setup();
    const pending = h.pending();
    const controller = new AbortController();
    const stream = await h.start(input(), controller.signal);
    controller.abort();
    expect(pending.signal().aborted).toBe(true);
    pending.release();
    const output = await events(stream);
    expect(output).toContainEqual(
      expect.objectContaining({ type: 'error', code: 'RA_CANCELLED' }),
    );
    expect(output.some((event) => event.type === 'proposal')).toBe(false);
  });

  it('times out with an AbortSignal observed by the worker', async () => {
    jest.useFakeTimers();
    const h = setup();
    h.worker.mockImplementation(
      (_request, _selection, _auth, signal) =>
        new Promise((resolve) => {
          signal.addEventListener('abort', () => resolve(), { once: true });
        }),
    );
    const stream = await h.start();
    const output = events(stream);
    await jest.advanceTimersByTimeAsync(L.runMs);
    expect(h.worker.mock.calls[0][3].aborted).toBe(true);
    expect(await output).toContainEqual(
      expect.objectContaining({ type: 'error', code: 'RA_TIMEOUT' }),
    );
  });

  it('rejects configuration changes before completion', async () => {
    const h = setup();
    const pending = h.pending();
    const stream = await h.start();
    h.value.generation++;
    pending.release();
    const output = await events(stream);
    expect(output).toContainEqual(
      expect.objectContaining({
        type: 'error',
        code: 'RA_CONFIGURATION_CHANGED',
      }),
    );
    expect(output.some((event) => event.type === 'proposal')).toBe(false);
  });

  it('polls configuration and aborts ongoing work', async () => {
    jest.useFakeTimers();
    const h = setup();
    const pending = h.pending();
    const stream = await h.start();
    h.value.connectionGenerations.p++;
    await jest.advanceTimersByTimeAsync(2000);
    expect(pending.signal().aborted).toBe(true);
    pending.release();
    expect(await events(stream)).toContainEqual(
      expect.objectContaining({
        type: 'error',
        code: 'RA_CONFIGURATION_CHANGED',
      }),
    );
  });

  it.each(['throw', 'error', 'partial'])(
    'does not expose provider secrets or applicable proposals after %s',
    async (kind) => {
      const h = setup();
      h.worker.mockImplementation(
        (request, _selection, _auth, _signal, emit) => {
          if (kind === 'throw') return Promise.reject(new Error(secret));
          emit({
            binding: request.snapshot.binding,
            type: 'status',
            status: 'working',
          });
          if (kind === 'error')
            emit({
              binding: request.snapshot.binding,
              type: 'error',
              code: secret,
            });
          return Promise.resolve();
        },
      );
      const output = await events(await h.start());
      expect(output.some((event) => event.type === 'proposal')).toBe(false);
      expect(output).toContainEqual(
        expect.objectContaining({
          type: 'error',
          code:
            kind === 'partial' ? 'RA_INVALID_PROPOSAL' : 'RA_PROVIDER_FAILED',
        }),
      );
    },
  );

  it('rejects a missing registry model without worker execution', async () => {
    const h = setup();
    jest
      .mocked(piRegistry)
      .mockResolvedValue({ models: { getModel: () => undefined } } as never);
    await expect(h.start()).rejects.toThrow('RA_MODEL_REQUIRED');
    expect(h.getAuth).not.toHaveBeenCalled();
    expect(h.worker).not.toHaveBeenCalled();
  });

  it('suppresses an already received proposal if the worker later reports failure', async () => {
    const h = setup();
    const original = h.worker.getMockImplementation()!;
    h.worker.mockImplementation(async (...args) => {
      await original(...args);
      args[4]({
        binding: args[0].snapshot.binding,
        type: 'error',
        code: 'RA_INVALID_PROPOSAL',
      });
    });
    const output = await events(await h.start());
    expect(output.some((event) => event.type === 'proposal')).toBe(false);
    expect(output).toContainEqual(
      expect.objectContaining({ type: 'error', code: 'RA_INVALID_PROPOSAL' }),
    );
  });

  it('aborts when the response reader cancels and releases the active reservation', async () => {
    const h = setup();
    const pending = h.pending();
    const stream = await h.start();
    const reader = stream.getReader();
    await reader.read();
    await reader.cancel();
    expect(pending.signal().aborted).toBe(true);
    pending.release();
    // Let the asynchronous worker finally block run after cancellation.
    await new Promise<void>((resolve) => setImmediate(resolve));
    await expect(h.service.cancel('user', 'session', 'run')).rejects.toThrow(
      'RA_RUN_NOT_FOUND',
    );
  });

  it('does not expose credentials when authentication resolution throws', async () => {
    const h = setup();
    h.getAuth.mockRejectedValue(new Error(secret));
    await expect(h.start()).rejects.toThrow('RA_PROVIDER_FAILED');
    expect(h.worker).not.toHaveBeenCalled();
  });
});
