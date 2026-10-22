import { Prisma, type AiAuthorization } from '@prisma/client';
import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AiCatalogService } from './ai-catalog';
import { ACTIVE_AI_ATTEMPTS, AiCredentialStore } from './ai-credential-store';
import {
  aiError,
  boundedString,
  generationInput,
  hasControlCharacters,
  objectInput,
} from './ai-errors';
import { AiSecretBox } from './ai-secret-box';

export type OpenRouterExchange = (
  code: string,
  verifier: string,
  signal: AbortSignal,
) => Promise<string>;
const hash = (value: string) =>
  createHash('sha256').update(value).digest('hex');
const attemptId = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
    ? value
    : aiError('AI_ATTEMPT_NOT_FOUND', 404);

export class AiSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    readonly catalog: AiCatalogService,
    private readonly secrets: AiSecretBox,
    private readonly exchange: OpenRouterExchange = exchangeOpenRouter,
  ) {}

  store(userId: string, sessionId: string) {
    return new AiCredentialStore(this.prisma, this.secrets, userId, sessionId);
  }

  async settings(userId: string, sessionId: string) {
    await this.store(userId, sessionId).assertSession();
    const [settings, connections] = await Promise.all([
      this.prisma.aiSettings.findUnique({ where: { userId } }),
      this.prisma.aiConnection.findMany({
        where: { userId },
        select: {
          providerId: true,
          authMethod: true,
          status: true,
          generation: true,
        },
        orderBy: { providerId: 'asc' },
      }),
    ]);
    return {
      generation: settings?.generation ?? 0,
      selection: settings?.selection ?? null,
      connections: connections.filter(
        (connection) => connection.status !== 'disconnected',
      ),
      connectionGenerations: Object.fromEntries(
        connections.map((connection) => [
          connection.providerId,
          connection.generation,
        ]),
      ),
    };
  }

  async save(userId: string, sessionId: string, input: unknown) {
    const body = objectInput(input);
    if (
      Object.keys(body).some(
        (key) => !['generation', 'selection'].includes(key),
      )
    )
      return aiError('AI_INVALID_INPUT');
    const generation = generationInput(body.generation);
    const selection = await this.catalog.selection(body.selection);
    const store = this.store(userId, sessionId);
    await this.prisma.$transaction(async (tx) => {
      await store.lockSession(tx);
      await tx.aiSettings.upsert({
        where: { userId },
        create: { userId },
        update: {},
      });
      const changed = await tx.aiSettings.updateMany({
        where: { userId, generation },
        data: {
          generation: { increment: 1 },
          selection: selection === null ? Prisma.DbNull : selection,
        },
      });
      if (changed.count !== 1) return aiError('AI_CONFIGURATION_CHANGED', 409);
    });
    return this.settings(userId, sessionId);
  }

  async connect(
    userId: string,
    sessionId: string,
    providerId: string,
    input: unknown,
  ) {
    const body = objectInput(input);
    if (
      Object.keys(body).some(
        (key) => !['apiKey', 'config', 'expectedGeneration'].includes(key),
      )
    )
      return aiError('AI_INVALID_INPUT');
    const credential = await this.catalog.keyCredential(providerId, body);
    await this.store(userId, sessionId).replace(
      providerId,
      credential,
      generationInput(body.expectedGeneration),
    );
    return this.settings(userId, sessionId);
  }

  async disconnect(
    userId: string,
    sessionId: string,
    providerId: string,
    input: unknown,
  ) {
    const body = objectInput(input);
    if (Object.keys(body).some((key) => key !== 'expectedGeneration'))
      return aiError('AI_INVALID_INPUT');
    // A disconnected provider remains removable when encryption is unavailable or policy changes.
    const known = (await this.catalog.catalog()).providers.some(
      (provider) => provider.id === providerId,
    );
    if (!known) return aiError('AI_UNSUPPORTED_PROVIDER');
    await this.store(userId, sessionId).disconnect(
      providerId,
      generationInput(body.expectedGeneration),
    );
    return this.settings(userId, sessionId);
  }

  async start(userId: string, sessionId: string, providerId: string) {
    await this.catalog.assertMethod(providerId, 'oauth');
    if (providerId !== 'openrouter')
      return aiError('AI_METHOD_UNAVAILABLE', 503);
    const origin = this.catalog.publicOrigin();
    if (!origin) return aiError('AI_METHOD_UNAVAILABLE', 503);
    const state = randomBytes(32).toString('base64url');
    const verifier = randomBytes(32).toString('base64url');
    const id = randomUUID();
    const expiresAt = new Date(Date.now() + 5 * 60_000);
    const store = this.store(userId, sessionId);
    const row = await this.prisma.$transaction(async (tx) => {
      await store.lockSession(tx);
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
      await tx.aiAuthorization.deleteMany({
        where: { userId, expiresAt: { lte: new Date() } },
      });
      const recent = await tx.aiAuthorization.count({ where: { userId } });
      if (recent >= 32) return aiError('AI_TOO_MANY_ATTEMPTS', 429);
      const count = await tx.aiAuthorization.count({
        where: { userId, status: { in: ACTIVE_AI_ATTEMPTS } },
      });
      if (count >= 8) return aiError('AI_TOO_MANY_ATTEMPTS', 429);
      const connection = await tx.aiConnection.upsert({
        where: { userId_providerId: { userId, providerId } },
        create: { userId, providerId },
        update: {},
      });
      await tx.aiAuthorization.updateMany({
        where: { userId, providerId, status: { in: ACTIVE_AI_ATTEMPTS } },
        data: {
          status: 'cancelled',
          verifierEncrypted: null,
          codeEncrypted: null,
        },
      });
      return tx.aiAuthorization.create({
        data: {
          id,
          userId,
          sessionId,
          providerId,
          generation: connection.generation,
          expiresAt,
          stateHash: hash(state),
          verifierEncrypted: this.secrets.encrypt(
            userId,
            providerId,
            `verifier:${id}`,
            verifier,
          ),
        },
      });
    });
    const authorization = new URL('https://openrouter.ai/auth');
    authorization.search = new URLSearchParams({
      callback_url: `${origin}/api/backend/ai/oauth/openrouter/callback/${id}`,
      state,
      key_label: 'Kestrel',
      code_challenge: createHash('sha256').update(verifier).digest('base64url'),
      code_challenge_method: 'S256',
    }).toString();
    return { ...describeAttempt(row), authorizationUrl: authorization.href };
  }

  /** Public callback only stores an encrypted code. Authenticated completion performs the exchange. */
  async callback(
    id: string,
    values: { state?: string; code?: string; error?: string },
  ) {
    const origin = this.catalog.publicOrigin();
    if (!origin) return aiError('AI_METHOD_UNAVAILABLE', 503);
    const row = await this.prisma.aiAuthorization.findUnique({
      where: { id: attemptId(id) },
    });
    if (!row || row.providerId !== 'openrouter' || row.expiresAt <= new Date())
      return aiError('AI_ATTEMPT_EXPIRED', 410);
    const denied = values.error !== undefined;
    if (denied) {
      boundedString(values.error, 128);
      if (values.code !== undefined) return aiError('AI_INVALID_INPUT');
    }
    // OpenRouter omits state on denial. That path can only fail a pending attempt;
    // it cannot store a code, exchange one, or change a saved connection.
    if (!denied || values.state !== undefined) {
      const state = boundedString(values.state, 128);
      if (
        !timingSafeEqual(
          Buffer.from(hash(state), 'hex'),
          Buffer.from(row.stateHash, 'hex'),
        )
      )
        return aiError('AI_STATE_MISMATCH', 403);
    }
    const store = this.store(row.userId, row.sessionId);
    await store.assertSession();
    if (row.status !== 'pending') return aiError('AI_ATTEMPT_CONSUMED', 409);
    const data = denied
      ? { status: 'failed', verifierEncrypted: null, codeEncrypted: null }
      : {
          status: 'code_received',
          codeEncrypted: this.secrets.encrypt(
            row.userId,
            row.providerId,
            `code:${row.id}`,
            boundedString(values.code, 8192),
          ),
        };
    const changed = await this.prisma.aiAuthorization.updateMany({
      where: { id: row.id, status: 'pending', expiresAt: { gt: new Date() } },
      data,
    });
    if (changed.count !== 1) return aiError('AI_ATTEMPT_CONSUMED', 409);
    return `${origin}/dashboard/account?aiAttempt=${row.id}#ai-assistant`;
  }

  private async ownedAttempt(userId: string, sessionId: string, id: string) {
    await this.store(userId, sessionId).assertSession();
    const row = await this.prisma.aiAuthorization.findFirst({
      where: { id: attemptId(id), userId, sessionId },
    });
    if (!row) return aiError('AI_ATTEMPT_NOT_FOUND', 404);
    return row;
  }

  async attempt(userId: string, sessionId: string, id: string) {
    return describeAttempt(await this.ownedAttempt(userId, sessionId, id));
  }

  async cancel(userId: string, sessionId: string, id: string) {
    const row = await this.ownedAttempt(userId, sessionId, id);
    await this.prisma.aiAuthorization.updateMany({
      where: {
        id: row.id,
        userId,
        sessionId,
        status: { in: ACTIVE_AI_ATTEMPTS },
      },
      data: {
        status: 'cancelled',
        verifierEncrypted: null,
        codeEncrypted: null,
      },
    });
    return this.attempt(userId, sessionId, id);
  }

  async complete(userId: string, sessionId: string, id: string) {
    const row = await this.ownedAttempt(userId, sessionId, id);
    await this.catalog.assertMethod(row.providerId, 'oauth');
    if (row.status === 'completed') {
      const connection = await this.prisma.aiConnection.findUnique({
        where: { userId_providerId: { userId, providerId: row.providerId } },
      });
      if (
        connection?.generation !== row.resultGeneration ||
        connection.status !== 'connected'
      )
        return aiError('AI_CONFIGURATION_CHANGED', 409);
      return describeAttempt(row);
    }
    if (row.expiresAt <= new Date()) return aiError('AI_ATTEMPT_EXPIRED', 410);
    if (
      row.status !== 'code_received' ||
      !row.verifierEncrypted ||
      !row.codeEncrypted
    )
      return aiError('AI_ATTEMPT_CONSUMED', 409);
    const claimed = await this.prisma.aiAuthorization.updateMany({
      where: {
        id: row.id,
        userId,
        sessionId,
        status: 'code_received',
        expiresAt: { gt: new Date() },
      },
      data: { status: 'processing' },
    });
    if (claimed.count !== 1) return aiError('AI_ATTEMPT_CONSUMED', 409);
    try {
      const verifier = this.secrets.decrypt(
        userId,
        row.providerId,
        `verifier:${row.id}`,
        row.verifierEncrypted,
      );
      const code = this.secrets.decrypt(
        userId,
        row.providerId,
        `code:${row.id}`,
        row.codeEncrypted,
      );
      const key = await this.exchange(
        code,
        verifier,
        AbortSignal.timeout(15_000),
      );
      if (
        !key ||
        key.length > 8192 ||
        /\s/.test(key) ||
        hasControlCharacters(key)
      )
        return aiError('AI_PROVIDER_RESPONSE_INVALID', 502);
      await this.store(userId, sessionId).replace(
        row.providerId,
        {
          type: 'oauth',
          access: key,
          refresh: '',
          expires: Number.MAX_SAFE_INTEGER,
        },
        row.generation,
        async (tx, generation) => {
          const changed = await tx.aiAuthorization.updateMany({
            where: {
              id: row.id,
              userId,
              sessionId,
              status: 'processing',
              expiresAt: { gt: new Date() },
            },
            data: {
              status: 'completed',
              resultGeneration: generation,
              verifierEncrypted: null,
              codeEncrypted: null,
            },
          });
          if (changed.count !== 1) return aiError('AI_ATTEMPT_CONSUMED', 409);
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
      return aiError('AI_AUTHORIZATION_FAILED', 409);
    }
    return this.attempt(userId, sessionId, id);
  }
}

function describeAttempt(row: AiAuthorization) {
  const expired =
    row.expiresAt <= new Date() && ACTIVE_AI_ATTEMPTS.includes(row.status);
  return {
    id: row.id,
    providerId: row.providerId,
    status: expired ? 'expired' : row.status,
    expiresAt: row.expiresAt.toISOString(),
  };
}

async function exchangeOpenRouter(
  code: string,
  verifier: string,
  signal: AbortSignal,
) {
  try {
    const response = await fetch('https://openrouter.ai/api/v1/auth/keys', {
      method: 'POST',
      redirect: 'error',
      signal,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        code,
        code_verifier: verifier,
        code_challenge_method: 'S256',
      }),
    });
    if (!response.ok || !response.body)
      return aiError('AI_PROVIDER_UNAVAILABLE', 502);
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.length;
        if (size > 16_384) return aiError('AI_PROVIDER_RESPONSE_INVALID', 502);
        chunks.push(part.value);
      }
    } finally {
      await reader.cancel().catch(() => undefined);
    }
    const data = objectInput(
      JSON.parse(Buffer.concat(chunks).toString('utf8')),
    );
    return boundedString(data.key, 8192);
  } catch {
    return aiError('AI_PROVIDER_UNAVAILABLE', 502);
  }
}
