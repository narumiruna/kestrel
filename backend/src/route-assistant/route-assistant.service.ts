import type { AuthResult } from '@earendil-works/pi-ai';
import { AiSettingsService } from '../ai/ai-settings.service';
import { type AiSelection, piRegistry } from '../ai/ai-catalog';
import { aiError } from '../ai/ai-errors';
import { createUserAiModels } from '../ai/ai-user-models';
import { HttpException } from '../http/errors';
import { PrismaService } from '../prisma/prisma.service';
import {
  type AssistantEvent,
  type AssistantRunInput,
  ROUTE_ASSISTANT_LIMITS as L,
} from './route-assistant.models';
import { validateAssistantInput } from './route-assistant.validation';
import { runAssistantWorker } from './route-assistant.worker-client';

type RunWorker = (
  input: AssistantRunInput,
  selection: AiSelection,
  auth: AuthResult,
  signal: AbortSignal,
  emit: (event: AssistantEvent) => void,
) => Promise<void>;
type ActiveRun = {
  userId: string;
  sessionId: string;
  controller: AbortController;
};

/** Transient single-process runs. No prompt, image, or proposal is stored in the database. */
export class RouteAssistantService {
  private readonly active = new Map<string, ActiveRun>();
  private readonly recent = new Map<
    string,
    { userId: string; startedAt: number }
  >();
  constructor(
    private readonly settings: AiSettingsService,
    private readonly prisma: PrismaService,
    private readonly worker: RunWorker = runAssistantWorker,
  ) {}

  private key(userId: string, sessionId: string, runId: string) {
    return `${userId}:${sessionId}:${runId}`;
  }

  private reserve(input: AssistantRunInput) {
    const now = Date.now();
    for (const [key, value] of this.recent) {
      if (now - value.startedAt > L.reviewMs) this.recent.delete(key);
    }
    const b = input.snapshot.binding;
    const key = this.key(b.userId, b.sessionId, b.runId);
    if (this.recent.has(key)) return aiError('RA_DUPLICATE_RUN', 409);
    const recent = [...this.recent.values()].filter(
      (entry) => entry.userId === b.userId && now - entry.startedAt < 60_000,
    );
    if (
      this.active.size >= L.concurrentRuns ||
      [...this.active.values()].some((run) => run.userId === b.userId) ||
      recent.length >= L.startsPerMinute ||
      this.recent.size >= 256
    )
      return aiError('RA_BUSY', 429);
    const controller = new AbortController();
    this.active.set(key, {
      userId: b.userId,
      sessionId: b.sessionId,
      controller,
    });
    this.recent.set(key, { userId: b.userId, startedAt: now });
    return { key, controller };
  }

  private async current(input: AssistantRunInput): Promise<AiSelection> {
    const b = input.snapshot.binding;
    const value = await this.settings.settings(b.userId, b.sessionId);
    const selection = await this.settings.catalog.selection(value.selection);
    if (!selection || selection.modelType !== 'chat')
      return aiError('RA_MODEL_REQUIRED', 409);
    if (
      value.generation !== b.settingsGeneration ||
      value.connectionGenerations[selection.providerId] !==
        b.connectionGeneration
    )
      return aiError('RA_CONFIGURATION_CHANGED', 409);
    const connection = value.connections.find(
      (entry) => entry.providerId === selection.providerId,
    );
    if (
      !connection ||
      (connection.status !== 'connected' && !connection.refreshing) ||
      connection.authMethod !== selection.authMethod
    )
      return aiError('RA_CONNECTION_REQUIRED', 409);
    const provider = (await this.settings.catalog.catalog()).providers.find(
      (entry) => entry.id === selection.providerId,
    );
    const model = provider?.models.find(
      (entry) => entry.id === selection.modelId && entry.type === 'chat',
    );
    if (!model?.imageInput) return aiError('RA_MODEL_REQUIRED', 409);
    return selection;
  }

  async start(
    userId: string,
    sessionId: string,
    raw: unknown,
    requestSignal: AbortSignal,
  ) {
    const input = validateAssistantInput(raw, userId, sessionId);
    const { key, controller } = this.reserve(input);
    const abort = () => controller.abort();
    requestSignal.addEventListener('abort', abort, { once: true });
    if (requestSignal.aborted) controller.abort();
    const deadline = setTimeout(() => controller.abort('timeout'), L.runMs);
    const cleanup = () => {
      clearTimeout(deadline);
      requestSignal.removeEventListener('abort', abort);
      this.active.delete(key);
    };
    try {
      const selection = await withinRun(controller.signal, () =>
        this.current(input),
      );
      controller.signal.throwIfAborted();
      const routeId = input.snapshot.binding.routeId;
      if (!routeId.startsWith('new:')) {
        if (!/^[a-f0-9-]{36}$/i.test(routeId))
          return aiError('RA_INVALID_INPUT');
        const route = await withinRun(controller.signal, () =>
          this.prisma.route.findFirst({
            where: { id: routeId, userId, deletedAt: null },
            select: { id: true },
          }),
        );
        if (!route) return aiError('RA_ROUTE_NOT_FOUND', 404);
      } else if (!/^new:[a-f0-9-]{36}$/i.test(routeId))
        return aiError('RA_INVALID_INPUT');
      const store = this.settings.store(userId, sessionId);
      const registry = await withinRun(controller.signal, piRegistry);
      const model = registry.models.getModel(
        selection.providerId,
        selection.modelId,
      );
      if (!model?.input.includes('image'))
        return aiError('RA_MODEL_REQUIRED', 409);
      const models = await withinRun(controller.signal, () =>
        createUserAiModels(store, this.settings.catalog),
      );
      const auth = await withinRun(controller.signal, () =>
        models.getAuth(model, { signal: controller.signal }),
      );
      if (
        !auth ||
        (!auth.auth.apiKey && !Object.keys(auth.auth.headers ?? {}).length)
      )
        return aiError('RA_CONNECTION_REQUIRED', 409);
      await withinRun(controller.signal, () => this.current(input));
      controller.signal.throwIfAborted();
      const encoder = new TextEncoder();
      let cancelled = false;
      return new ReadableStream<Uint8Array>({
        start: (output) => {
          let closed = false;
          let checking = false;
          let changed = false;
          const emit = (event: AssistantEvent) => {
            if (!closed && !cancelled)
              output.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
          };
          const monitor = setInterval(() => {
            if (checking || controller.signal.aborted) return;
            checking = true;
            void withinRun(controller.signal, () => this.current(input))
              .catch(() => {
                if (controller.signal.aborted) return;
                changed = true;
                controller.abort('configuration');
              })
              .finally(() => {
                checking = false;
              });
          }, 2000);
          const run = async () => {
            let result: AssistantEvent | undefined;
            let errorCode: string | undefined;
            try {
              emit({
                binding: input.snapshot.binding,
                type: 'status',
                status: 'working',
              });
              await this.worker(
                input,
                selection,
                auth,
                controller.signal,
                (event) => {
                  if (controller.signal.aborted) return;
                  // Never forward raw provider messages or tool arguments. Only the last validated result is kept.
                  if (
                    event.type === 'proposal' ||
                    event.type === 'clarification'
                  )
                    result = event;
                  else if (event.type === 'error')
                    errorCode = /^RA_[A-Z_]{1,48}$/.test(event.code)
                      ? event.code
                      : 'RA_PROVIDER_FAILED';
                  else if (event.type === 'status')
                    emit({
                      binding: input.snapshot.binding,
                      type: 'status',
                      status: 'validating',
                    });
                },
              );
              await withinRun(controller.signal, () => this.current(input));
              controller.signal.throwIfAborted();
              if (errorCode) return aiError(errorCode);
              if (!result) return aiError('RA_INVALID_PROPOSAL');
              emit({ ...result, binding: input.snapshot.binding });
            } catch (error) {
              const code = changed
                ? 'RA_CONFIGURATION_CHANGED'
                : controller.signal.aborted
                  ? controller.signal.reason === 'timeout'
                    ? 'RA_TIMEOUT'
                    : 'RA_CANCELLED'
                  : safeAssistantCode(error);
              emit({ binding: input.snapshot.binding, type: 'error', code });
            } finally {
              clearInterval(monitor);
              emit({ binding: input.snapshot.binding, type: 'done' });
              closed = true;
              try {
                if (!cancelled) output.close();
              } finally {
                input.snapshot.png = '';
                cleanup();
              }
            }
          };
          void run();
        },
        cancel: () => {
          cancelled = true;
          controller.abort();
        },
      });
    } catch (error) {
      const code = controller.signal.aborted
        ? controller.signal.reason === 'timeout'
          ? 'RA_TIMEOUT'
          : 'RA_CANCELLED'
        : safeAssistantCode(error);
      const status =
        error instanceof HttpException
          ? error.getStatus()
          : code === 'RA_TIMEOUT'
            ? 408
            : 503;
      controller.abort();
      input.snapshot.png = '';
      cleanup();
      throw new HttpException(
        { code, message: code, statusCode: status },
        status,
      );
    }
  }

  async cancel(userId: string, sessionId: string, runId: string) {
    await this.settings.store(userId, sessionId).assertSession();
    const run = this.active.get(this.key(userId, sessionId, runId));
    if (!run) return aiError('RA_RUN_NOT_FOUND', 404);
    run.controller.abort();
    return { ok: true };
  }
}

/** A stalled database/auth read cannot retain a run reservation beyond its deadline. */
function withinRun<T>(
  signal: AbortSignal,
  action: () => Promise<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error?: unknown, value?: T) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', abort);
      if (error !== undefined)
        reject(
          error instanceof Error ? error : new Error('RA_PROVIDER_FAILED'),
        );
      else resolve(value as T);
    };
    const abort = () => finish(signal.reason ?? new Error('RA_CANCELLED'));
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) {
      abort();
      return;
    }
    void Promise.resolve()
      .then(() => {
        signal.throwIfAborted();
        return action();
      })
      .then(
        (value) => finish(undefined, value),
        (error: unknown) => finish(error),
      );
  });
}

export function safeAssistantCode(error: unknown): string {
  if (error instanceof HttpException) {
    const value = error.getResponse();
    if (
      typeof value === 'object' &&
      value &&
      'code' in value &&
      typeof value.code === 'string' &&
      /^(RA|AI)_[A-Z_]{1,48}$/.test(value.code)
    )
      return value.code;
  }
  return 'RA_PROVIDER_FAILED';
}
