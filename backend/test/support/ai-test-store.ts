/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/require-await */
// Dynamic Prisma-shaped rows are limited to this test double.
import { randomUUID } from 'node:crypto';

// In-memory protocol double only: this does not prove PostgreSQL locking or isolation.
type Row = Record<string, any>;
type Args = {
  where?: Row;
  data?: Row;
  create?: Row;
  update?: Row;
  select?: Row;
};

function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (key === 'OR') return value.some((part: Row) => matches(row, part));
    if (key === 'AND') return value.every((part: Row) => matches(row, part));
    if (key === 'userId_providerId') return matches(row, value);
    const actual = row[key];
    if (value && typeof value === 'object' && !(value instanceof Date)) {
      return Object.entries(value).every(([operator, operand]) => {
        if (operator === 'in') return (operand as unknown[]).includes(actual);
        if (operator === 'not') return actual !== operand;
        if (operator === 'gt') return actual != null && actual > operand!;
        if (operator === 'lte') return actual != null && actual <= operand!;
        throw new Error(`Unsupported test predicate: ${operator}`);
      });
    }
    return actual === value;
  });
}

function project(row: Row | undefined, select?: Row) {
  if (!row) return null;
  return structuredClone(
    select
      ? Object.fromEntries(
          Object.keys(select)
            .filter((key) => select[key])
            .map((key) => [key, row[key]]),
        )
      : row,
  );
}

export function createAiTestStore() {
  const aiConnection = new Map<string, Row>();
  const aiAuthorization = new Map<string, Row>();
  const aiSettings = new Map<string, Row>();
  const sessions = new Map<string, Row>();
  const data = { aiConnection, aiAuthorization, aiSettings, sessions };
  function delegate(rows: Map<string, Row>, kind: string) {
    const key = (row: Row) =>
      kind === 'connection'
        ? `${row.userId}:${row.providerId}`
        : kind === 'settings'
          ? row.userId
          : row.id;
    const find = (args: Args) =>
      [...rows.values()].find((row) => matches(row, args.where));
    const apply = (row: Row, values: Row = {}) => {
      for (const [field, value] of Object.entries(values))
        row[field] =
          value && typeof value === 'object' && 'increment' in value
            ? row[field] + value.increment
            : structuredClone(value);
    };
    const create = async ({ data: values = {}, select }: Args) => {
      const defaults =
        kind === 'connection'
          ? {
              generation: 0,
              authMethod: null,
              status: 'disconnected',
              credentialEncrypted: null,
              leaseId: null,
              leaseExpiresAt: null,
              updatedAt: new Date(),
            }
          : kind === 'settings'
            ? { generation: 0, selection: null, updatedAt: new Date() }
            : {
                id: randomUUID(),
                status: 'pending',
                resultGeneration: null,
                verifierEncrypted: null,
                codeEncrypted: null,
                createdAt: new Date(),
              };
      const row = { ...defaults, ...structuredClone(values) };
      if (rows.has(key(row))) throw new Error('Duplicate test row');
      rows.set(key(row), row);
      return project(row, select);
    };
    return {
      findUnique: async (args: Args) => project(find(args), args.select),
      findFirst: async (args: Args) => project(find(args), args.select),
      findUniqueOrThrow: async (args: Args) => {
        const row = find(args);
        if (!row) throw new Error('Missing test row');
        return project(row, args.select);
      },
      findMany: async (args: Args = {}) =>
        [...rows.values()]
          .filter((row) => matches(row, args.where))
          .map((row) => project(row, args.select)),
      count: async (args: Args = {}) =>
        [...rows.values()].filter((row) => matches(row, args.where)).length,
      create,
      upsert: async (args: Args) => {
        const row = find(args);
        if (!row) return create({ data: args.create, select: args.select });
        apply(row, args.update);
        return project(row, args.select);
      },
      updateMany: async (args: Args) => {
        let count = 0;
        for (const row of rows.values())
          if (matches(row, args.where)) {
            apply(row, args.data);
            count++;
          }
        return { count };
      },
      deleteMany: async (args: Args = {}) => {
        let count = 0;
        for (const [id, row] of rows)
          if (matches(row, args.where)) {
            rows.delete(id);
            count++;
          }
        return { count };
      },
    };
  }
  const prisma = {
    aiConnection: delegate(aiConnection, 'connection'),
    aiAuthorization: delegate(aiAuthorization, 'authorization'),
    aiSettings: delegate(aiSettings, 'settings'),
    session: delegate(sessions, 'session'),
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      if (strings.join('').includes('FROM users')) return [{ id: values[0] }];
      const row = sessions.get(String(values[0]));
      return row &&
        row.userId === values[1] &&
        row.revokedAt === null &&
        row.expiresAt > new Date()
        ? [{ id: row.id }]
        : [];
    },
    $transaction: async <T>(fn: (tx: any) => Promise<T>): Promise<T> => {
      const snapshots = Object.values(data).map((map) => structuredClone(map));
      try {
        return await fn(prisma);
      } catch (error) {
        Object.values(data).forEach((map, index) => {
          map.clear();
          for (const [key, row] of snapshots[index]) map.set(key, row);
        });
        throw error;
      }
    },
  };
  function seedSession(userId: string, sessionId = randomUUID()) {
    sessions.set(sessionId, {
      id: sessionId,
      userId,
      revokedAt: null,
      expiresAt: new Date(Date.now() + 3_600_000),
    });
    return sessionId;
  }
  return { prisma, data, ...data, seedSession };
}
