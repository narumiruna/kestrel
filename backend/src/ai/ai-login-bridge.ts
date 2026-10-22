import type { AuthEvent, AuthPrompt } from '@earendil-works/pi-ai';
import type { AiAuthorization } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { isIP } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { PrismaService } from '../prisma/prisma.service';
import { AiCredentialStore } from './ai-credential-store';
import { aiError, boundedString, objectInput } from './ai-errors';
import { type AiLoginRunner, loginWithPi } from './ai-pi-login';
import { AiSecretBox } from './ai-secret-box';

export type AiLoginInteraction = {
  authorizationUrl?: string;
  instructions?: string;
  userCode?: string;
  message?: string;
  prompt?: {
    id: string;
    type: 'text' | 'secret' | 'manual_code' | 'select';
    message: string;
    placeholder?: string;
    options?: { id: string; label: string }[];
  };
};
const STALE_MS = 15_000;
export function providerLoginUrl(value: string) {
  const url = new URL(boundedString(value, 8192));
  const host = url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.port ||
    isIP(host) ||
    !host.includes('.') ||
    /\.(?:localhost|local|internal)$/.test(host)
  )
    return aiError('AI_PROVIDER_RESPONSE_INVALID', 502);
  return url.href;
}

/** Provider jobs keep no tokens on disk. All browser interaction is owner-bound and encrypted. */
export class AiLoginBridge {
  private readonly jobs = new Map<string, AbortController>();
  constructor(
    private readonly prisma: PrismaService,
    private readonly secrets: AiSecretBox,
    private readonly runner: AiLoginRunner = loginWithPi,
  ) {}

  assertCapacity() {
    if (this.jobs.size >= 16) return aiError('AI_TOO_MANY_ATTEMPTS', 429);
  }

  start(row: AiAuthorization) {
    this.assertCapacity();
    const controller = new AbortController();
    this.jobs.set(row.id, controller);
    void this.run(row, controller)
      .catch(() => undefined)
      .finally(() => {
        this.jobs.delete(row.id);
      });
  }

  cancel(id: string) {
    this.jobs.get(id)?.abort();
  }

  async interaction(
    row: AiAuthorization,
  ): Promise<AiLoginInteraction | undefined> {
    if (!row.heartbeatAt || row.status !== 'processing') return undefined;
    if (row.heartbeatAt.getTime() <= Date.now() - STALE_MS) {
      const changed = await this.prisma.aiAuthorization.updateMany({
        where: {
          id: row.id,
          status: 'processing',
          heartbeatAt: { lte: new Date(Date.now() - STALE_MS) },
        },
        data: {
          status: 'failed',
          verifierEncrypted: null,
          codeEncrypted: null,
        },
      });
      if (changed.count === 1) this.cancel(row.id);
      return undefined;
    }
    const value = this.decode(row);
    if (row.codeEncrypted) delete value.prompt;
    return value;
  }

  async respond(row: AiAuthorization, input: unknown) {
    const body = objectInput(input);
    if (Object.keys(body).some((key) => !['promptId', 'value'].includes(key)))
      return aiError('AI_INVALID_INPUT');
    if (
      !row.heartbeatAt ||
      row.heartbeatAt.getTime() <= Date.now() - STALE_MS ||
      row.status !== 'processing' ||
      row.expiresAt <= new Date()
    )
      return aiError('AI_ATTEMPT_CONSUMED', 409);
    const prompt = this.decode(row).prompt;
    if (!prompt || prompt.id !== body.promptId || row.codeEncrypted)
      return aiError('AI_CONFIGURATION_CHANGED', 409);
    const value = boundedString(body.value, 8192);
    if (
      prompt.type === 'select' &&
      !prompt.options?.some((option) => option.id === value)
    )
      return aiError('AI_INVALID_INPUT');
    const changed = await this.prisma.aiAuthorization.updateMany({
      where: {
        id: row.id,
        userId: row.userId,
        sessionId: row.sessionId,
        status: 'processing',
        verifierEncrypted: row.verifierEncrypted,
        codeEncrypted: null,
        expiresAt: { gt: new Date() },
        heartbeatAt: { gt: new Date(Date.now() - STALE_MS) },
      },
      data: {
        codeEncrypted: this.secrets.encrypt(
          row.userId,
          row.providerId,
          `code:${row.id}`,
          JSON.stringify({ promptId: prompt.id, value }),
        ),
      },
    });
    if (changed.count !== 1) return aiError('AI_CONFIGURATION_CHANGED', 409);
  }

  private decode(row: AiAuthorization): AiLoginInteraction {
    if (!row.verifierEncrypted) return {};
    return JSON.parse(
      this.secrets.decrypt(
        row.userId,
        row.providerId,
        `verifier:${row.id}`,
        row.verifierEncrypted,
      ),
    ) as AiLoginInteraction;
  }

  private async run(row: AiAuthorization, controller: AbortController) {
    const store = new AiCredentialStore(
      this.prisma,
      this.secrets,
      row.userId,
      row.sessionId,
    );
    const signal = AbortSignal.any([
      controller.signal,
      AbortSignal.timeout(Math.max(1, row.expiresAt.getTime() - Date.now())),
    ]);
    const state: AiLoginInteraction = {};
    let tail = Promise.resolve();
    let checking = false;
    const active = () => ({
      id: row.id,
      userId: row.userId,
      sessionId: row.sessionId,
      status: 'processing',
      expiresAt: { gt: new Date() },
    });
    const publish = async () => {
      signal.throwIfAborted();
      const changed = await this.prisma.aiAuthorization.updateMany({
        where: active(),
        data: {
          verifierEncrypted: this.secrets.encrypt(
            row.userId,
            row.providerId,
            `verifier:${row.id}`,
            JSON.stringify(state),
          ),
        },
      });
      if (changed.count !== 1) throw new Error('AI login ended');
    };
    const check = async () => {
      if (checking) return;
      checking = true;
      try {
        await store.assertSession();
        const changed = await this.prisma.aiAuthorization.updateMany({
          where: active(),
          data: { heartbeatAt: new Date() },
        });
        if (changed.count !== 1) controller.abort();
      } catch {
        controller.abort();
      } finally {
        checking = false;
      }
    };
    const timer = setInterval(() => {
      void check();
    }, 1000);
    timer.unref();
    try {
      await check();
      signal.throwIfAborted();
      const credential = await this.runner(row.providerId, row.userId, {
        signal,
        notify: (event) => {
          applyEvent(state, event);
          tail = tail.then(publish);
          void tail.catch(() => controller.abort());
        },
        prompt: async (prompt) => {
          await tail;
          const promptSignal = prompt.signal
            ? AbortSignal.any([signal, prompt.signal])
            : signal;
          promptSignal.throwIfAborted();
          const shown = showPrompt(prompt);
          state.prompt = shown;
          await publish();
          try {
            while (!promptSignal.aborted) {
              const current =
                await this.prisma.aiAuthorization.findUniqueOrThrow({
                  where: { id: row.id },
                });
              if (
                current.status !== 'processing' ||
                current.expiresAt <= new Date()
              )
                throw new Error('AI login ended');
              if (current.codeEncrypted) {
                const answer = objectInput(
                  JSON.parse(
                    this.secrets.decrypt(
                      row.userId,
                      row.providerId,
                      `code:${row.id}`,
                      current.codeEncrypted,
                    ),
                  ),
                );
                if (answer.promptId !== shown.id)
                  throw new Error('AI prompt changed');
                delete state.prompt;
                const changed = await this.prisma.aiAuthorization.updateMany({
                  where: {
                    ...active(),
                    codeEncrypted: current.codeEncrypted,
                    verifierEncrypted: current.verifierEncrypted,
                  },
                  data: {
                    codeEncrypted: null,
                    verifierEncrypted: this.secrets.encrypt(
                      row.userId,
                      row.providerId,
                      `verifier:${row.id}`,
                      JSON.stringify(state),
                    ),
                  },
                });
                if (changed.count !== 1) throw new Error('AI prompt changed');
                promptSignal.throwIfAborted();
                return boundedString(answer.value, 8192);
              }
              await delay(200, undefined, { signal: promptSignal });
            }
            throw new Error('AI login ended');
          } finally {
            if (state.prompt?.id === shown.id) {
              delete state.prompt;
              tail = tail.then(publish);
              void tail.catch(() => controller.abort());
            }
          }
        },
      });
      await tail;
      signal.throwIfAborted();
      if (JSON.stringify(credential).length > 65536)
        throw new Error('AI credential too large');
      await store.replace(
        row.providerId,
        credential,
        row.generation,
        async (tx, generation) => {
          const changed = await tx.aiAuthorization.updateMany({
            where: active(),
            data: {
              status: 'completed',
              resultGeneration: generation,
              verifierEncrypted: null,
              codeEncrypted: null,
            },
          });
          if (changed.count !== 1) throw new Error('AI login ended');
        },
      );
    } catch {
      await this.prisma.aiAuthorization.updateMany({
        where: { id: row.id, status: 'processing' },
        data: {
          status: 'failed',
          verifierEncrypted: null,
          codeEncrypted: null,
        },
      });
    } finally {
      clearInterval(timer);
      controller.abort();
    }
  }
}

function showPrompt(
  prompt: AuthPrompt,
): NonNullable<AiLoginInteraction['prompt']> {
  return {
    id: randomUUID(),
    type: prompt.type,
    message: boundedString(prompt.message, 2048),
    ...(prompt.type !== 'select' && prompt.placeholder
      ? { placeholder: boundedString(prompt.placeholder, 2048) }
      : {}),
    ...(prompt.type === 'select'
      ? {
          options: prompt.options.slice(0, 32).map((option) => ({
            id: boundedString(option.id, 128),
            label: boundedString(option.label, 512),
          })),
        }
      : {}),
  };
}
function applyEvent(state: AiLoginInteraction, event: AuthEvent) {
  if (event.type === 'auth_url') {
    state.authorizationUrl = providerLoginUrl(event.url);
    if (event.instructions)
      state.instructions = boundedString(event.instructions, 2048);
  } else if (event.type === 'device_code') {
    state.authorizationUrl = providerLoginUrl(event.verificationUri);
    state.userCode = boundedString(event.userCode, 256);
  } else {
    state.message = boundedString(event.message, 2048);
    if (event.type === 'info' && event.links?.[0])
      state.authorizationUrl = providerLoginUrl(event.links[0].url);
  }
}
