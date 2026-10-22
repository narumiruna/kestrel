import type {
  AuthOperationOptions,
  Credential,
  CredentialInfo,
  CredentialStore,
} from '@earendil-works/pi-ai';
import type { AiConnection, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { PrismaService } from '../prisma/prisma.service';
import { aiError } from './ai-errors';
import { AiSecretBox } from './ai-secret-box';

const LEASE_MS = 45_000;
const OPERATION_MS = 20_000;
export const ACTIVE_AI_ATTEMPTS = ['pending', 'code_received', 'processing'];

/** A database lease serializes refresh and mutations across Backend processes. */
export class AiCredentialStore implements CredentialStore {
  constructor(
    private readonly prisma: PrismaService,
    private readonly secrets: AiSecretBox,
    readonly userId: string,
    readonly sessionId: string,
  ) {}

  async assertSession(tx: Prisma.TransactionClient = this.prisma) {
    const session = await tx.session.findFirst({
      where: {
        id: this.sessionId,
        userId: this.userId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: { id: true },
    });
    if (!session) return aiError('AI_SESSION_EXPIRED', 401);
  }

  /** Lock the session row until commit so revocation cannot race a credential write. */
  async lockSession(tx: Prisma.TransactionClient) {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM sessions WHERE id = ${this.sessionId}::uuid AND user_id = ${this.userId}::uuid
      AND revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP FOR SHARE`;
    if (!rows.length) return aiError('AI_SESSION_EXPIRED', 401);
  }

  private decode(
    providerId: string,
    row: AiConnection,
  ): Credential | undefined {
    if (row.status === 'disconnected' || !row.credentialEncrypted)
      return undefined;
    if (row.status !== 'connected')
      return aiError('AI_RECONNECT_REQUIRED', 409);
    try {
      const value: unknown = JSON.parse(
        this.secrets.decrypt(
          this.userId,
          providerId,
          'credential',
          row.credentialEncrypted,
        ),
      );
      if (!validCredential(value) || value.type !== row.authMethod)
        return aiError('AI_CREDENTIAL_UNAVAILABLE', 503);
      return value;
    } catch (error) {
      if (error instanceof Error && error.name === 'HttpException') throw error;
      return aiError('AI_CREDENTIAL_UNAVAILABLE', 503);
    }
  }

  async read(providerId: string, options?: AuthOperationOptions) {
    options?.signal?.throwIfAborted();
    await this.assertSession();
    const row = await this.prisma.aiConnection.findUnique({
      where: { userId_providerId: { userId: this.userId, providerId } },
    });
    if (!row) return undefined;
    if (
      row.status === 'reconnect_required' &&
      row.leaseExpiresAt &&
      row.leaseExpiresAt > new Date()
    ) {
      return this.withLease(
        providerId,
        (current) => Promise.resolve(this.decode(providerId, current)),
        options,
      );
    }
    return this.decode(providerId, row);
  }

  async list(options?: AuthOperationOptions): Promise<CredentialInfo[]> {
    options?.signal?.throwIfAborted();
    await this.assertSession();
    const rows = await this.prisma.aiConnection.findMany({
      where: { userId: this.userId, status: { not: 'disconnected' } },
      select: { providerId: true, authMethod: true },
    });
    return rows.flatMap((row) =>
      row.authMethod === 'api_key' || row.authMethod === 'oauth'
        ? [{ providerId: row.providerId, type: row.authMethod }]
        : [],
    );
  }

  async modify(
    providerId: string,
    fn: (current: Credential | undefined) => Promise<Credential | undefined>,
    options?: AuthOperationOptions,
  ) {
    return this.withLease(
      providerId,
      async (row, leaseId, signal) => {
        const current = this.decode(providerId, row);
        const oauthMutation = current?.type === 'oauth';
        if (oauthMutation) {
          // Pi may refresh before expiry or use a caller-specific validity window. Mark every
          // OAuth modify durably before its callback, not only credentials already expired.
          const marked = await this.prisma.aiConnection.updateMany({
            where: this.fence(providerId, row.generation, leaseId),
            data: { status: 'reconnect_required' },
          });
          if (marked.count !== 1)
            return aiError('AI_CONFIGURATION_CHANGED', 409);
        }
        if (!row.leaseExpiresAt || row.leaseExpiresAt <= new Date())
          return aiError('AI_CONNECTION_BUSY', 409);
        const next = await boundedOperation(() => fn(current), signal);
        const result = next ?? current;
        if (result === undefined) return undefined;
        if (!validCredential(result)) return aiError('AI_INVALID_CREDENTIAL');
        if (oauthMutation || next !== current) {
          await this.persist(
            providerId,
            row,
            leaseId,
            result,
            undefined,
            !oauthMutation,
          );
        }
        return result;
      },
      options,
    );
  }

  async replace(
    providerId: string,
    credential: Credential,
    expectedGeneration: number,
    onCommit?: (
      tx: Prisma.TransactionClient,
      generation: number,
    ) => Promise<void>,
  ) {
    if (!validCredential(credential)) return aiError('AI_INVALID_CREDENTIAL');
    return this.withLease(providerId, async (row, leaseId) => {
      if (row.generation !== expectedGeneration)
        return aiError('AI_CONFIGURATION_CHANGED', 409);
      return this.persist(providerId, row, leaseId, credential, onCommit);
    });
  }

  async delete(providerId: string, options?: AuthOperationOptions) {
    await this.disconnect(providerId, undefined, options);
  }

  async disconnect(
    providerId: string,
    expectedGeneration?: number,
    options?: AuthOperationOptions,
  ) {
    return this.withLease(
      providerId,
      async (row, leaseId) => {
        if (
          expectedGeneration !== undefined &&
          row.generation !== expectedGeneration
        )
          return aiError('AI_CONFIGURATION_CHANGED', 409);
        await this.prisma.$transaction(async (tx) => {
          await this.lockSession(tx);
          const changed = await tx.aiConnection.updateMany({
            where: this.fence(providerId, row.generation, leaseId),
            data: {
              credentialEncrypted: null,
              authMethod: null,
              status: 'disconnected',
              generation: { increment: 1 },
            },
          });
          if (changed.count !== 1)
            return aiError('AI_CONFIGURATION_CHANGED', 409);
          await tx.aiAuthorization.updateMany({
            where: {
              userId: this.userId,
              providerId,
              status: { in: ACTIVE_AI_ATTEMPTS },
            },
            data: {
              status: 'cancelled',
              verifierEncrypted: null,
              codeEncrypted: null,
            },
          });
        });
      },
      options,
    );
  }

  private fence(providerId: string, generation: number, leaseId: string) {
    return {
      userId: this.userId,
      providerId,
      generation,
      leaseId,
      leaseExpiresAt: { gt: new Date() },
    };
  }

  private async persist(
    providerId: string,
    row: AiConnection,
    leaseId: string,
    credential: Credential,
    onCommit?: (
      tx: Prisma.TransactionClient,
      generation: number,
    ) => Promise<void>,
    incrementGeneration = true,
  ) {
    const encrypted = this.secrets.encrypt(
      this.userId,
      providerId,
      'credential',
      JSON.stringify(credential),
    );
    const generation = row.generation + (incrementGeneration ? 1 : 0);
    await this.prisma.$transaction(async (tx) => {
      await this.lockSession(tx);
      const changed = await tx.aiConnection.updateMany({
        where: this.fence(providerId, row.generation, leaseId),
        data: {
          generation,
          status: 'connected',
          authMethod: credential.type,
          credentialEncrypted: encrypted,
        },
      });
      if (changed.count !== 1) return aiError('AI_CONFIGURATION_CHANGED', 409);
      if (onCommit) await onCommit(tx, generation);
      // Replacement invalidates other attempts, including late exchanges from another process.
      await tx.aiAuthorization.updateMany({
        where: {
          userId: this.userId,
          providerId,
          status: { in: ACTIVE_AI_ATTEMPTS },
        },
        data: {
          status: 'cancelled',
          verifierEncrypted: null,
          codeEncrypted: null,
        },
      });
    });
    return generation;
  }

  private async withLease<T>(
    providerId: string,
    action: (
      row: AiConnection,
      leaseId: string,
      signal: AbortSignal,
    ) => Promise<T>,
    options?: AuthOperationOptions,
  ): Promise<T> {
    const signal = AbortSignal.any([
      options?.signal ?? new AbortController().signal,
      AbortSignal.timeout(OPERATION_MS),
    ]);
    await this.assertSession();
    await this.prisma.aiConnection.upsert({
      where: { userId_providerId: { userId: this.userId, providerId } },
      create: { userId: this.userId, providerId },
      update: {},
    });
    const leaseId = randomUUID();
    while (!signal.aborted) {
      const acquired = await this.prisma.aiConnection.updateMany({
        where: {
          userId: this.userId,
          providerId,
          OR: [{ leaseId: null }, { leaseExpiresAt: { lte: new Date() } }],
        },
        data: { leaseId, leaseExpiresAt: new Date(Date.now() + LEASE_MS) },
      });
      if (acquired.count === 1) {
        try {
          await this.assertSession();
          const row = await this.prisma.aiConnection.findUniqueOrThrow({
            where: { userId_providerId: { userId: this.userId, providerId } },
          });
          if (
            row.leaseId !== leaseId ||
            !row.leaseExpiresAt ||
            row.leaseExpiresAt <= new Date()
          )
            return aiError('AI_CONNECTION_BUSY', 409);
          return await boundedOperation(
            () => action(row, leaseId, signal),
            signal,
          );
        } finally {
          await this.prisma.aiConnection.updateMany({
            where: { userId: this.userId, providerId, leaseId },
            data: { leaseId: null, leaseExpiresAt: null },
          });
        }
      }
      await delay(25, undefined, { signal }).catch(() => undefined);
    }
    return aiError('AI_CONNECTION_BUSY', 409);
  }
}

function validCredential(value: unknown): value is Credential {
  if (!value || typeof value !== 'object' || !('type' in value)) return false;
  if (value.type === 'api_key')
    return (
      'key' in value &&
      typeof value.key === 'string' &&
      value.key.length > 0 &&
      value.key.length <= 8192
    );
  return (
    value.type === 'oauth' &&
    'access' in value &&
    typeof value.access === 'string' &&
    value.access.length > 0 &&
    'refresh' in value &&
    typeof value.refresh === 'string' &&
    'expires' in value &&
    typeof value.expires === 'number' &&
    Number.isFinite(value.expires)
  );
}

async function boundedOperation<T>(
  operation: () => Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  if (signal.aborted) return aiError('AI_OPERATION_EXPIRED', 409);
  let abort: (() => void) | undefined;
  try {
    return await Promise.race([
      operation(),
      new Promise<never>((_, reject) => {
        abort = () => reject(new Error('AI operation expired'));
        signal.addEventListener('abort', abort, { once: true });
      }),
    ]);
  } finally {
    if (abort) signal.removeEventListener('abort', abort);
  }
}
