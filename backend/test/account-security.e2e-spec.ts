/* eslint-disable @typescript-eslint/require-await -- in-memory Prisma methods intentionally mirror async client APIs */
import {
  DevicePlatform,
  PlaybackState,
  RemoteCommandStatus,
  RemoteCommandType,
  type Prisma,
} from '@prisma/client';
import { argon2id, hash } from 'argon2';
import { createAdaptorServer } from '@hono/node-server';
import request from 'supertest';
import { createApp } from '../src/app';
import { type Container, createContainer } from '../src/container';
import { AccessTokenService } from '../src/auth/access-token.service';
import { PrismaService } from '../src/prisma/prisma.service';

type StoredSession = {
  createdAt: Date;
  expiresAt: Date;
  id: string;
  ipAddress: string | null;
  lastUsedAt: Date;
  refreshTokenHash: string;
  revokedAt: Date | null;
  userAgent: string | null;
  userId: string;
};

type StoredDevice = {
  appVersion: string | null;
  clientDeviceId: string;
  createdAt: Date;
  id: string;
  lastSeenAt: Date;
  name: string;
  platform: DevicePlatform;
  registeredSessionId: string | null;
  remoteCommands: StoredCommand[];
  remoteControlEnabled: boolean;
  revokedAt: Date | null;
  state: { lastReportedAt: Date; playbackState: PlaybackState } | null;
  userId: string;
};

type StoredCommand = {
  appliedAt: Date | null;
  createdAt: Date;
  deliveredAt: Date | null;
  deviceId: string;
  errorMessage: string | null;
  expiresAt: Date;
  id: string;
  payload: Prisma.JsonValue;
  status: RemoteCommandStatus;
  type: RemoteCommandType;
  userId: string;
};

type SessionWhere = {
  expiresAt?: { gt?: Date };
  id?: string | { in?: string[]; not?: string };
  refreshTokenHash?: string;
  revokedAt?: null;
  userId?: string;
};

type DeviceWhere = {
  clientDeviceId?: string;
  id?: string | { in?: string[] };
  platform?: DevicePlatform;
  registeredSessionId?: { in?: string[] };
  revokedAt?: null;
  userId?: string;
};

class FakeAccountSecurityPrisma {
  private readonly passwordHash: string;
  readonly sessions: StoredSession[];
  readonly devices: StoredDevice[];
  readonly commands: StoredCommand[];

  constructor(passwordHash: string) {
    this.passwordHash = passwordHash;
    const activeUntil = new Date('2026-08-10T12:00:00.000Z');
    this.sessions = [
      createSession('session-web', activeUntil, 'Web browser'),
      createSession('session-android', activeUntil, 'Kestrel Android'),
      createSession('session-new', activeUntil, 'Kestrel Android'),
    ];
    this.commands = [
      {
        appliedAt: null,
        createdAt: new Date('2026-07-10T11:59:00.000Z'),
        deliveredAt: null,
        deviceId: 'device-1',
        errorMessage: null,
        expiresAt: new Date('2026-07-10T12:01:00.000Z'),
        id: 'command-queued',
        payload: {},
        status: RemoteCommandStatus.QUEUED,
        type: RemoteCommandType.STOP,
        userId: 'user-1',
      },
    ];
    this.devices = [
      {
        appVersion: '0.6.0',
        clientDeviceId: 'client-1',
        createdAt: new Date('2026-07-01T12:00:00.000Z'),
        id: 'device-1',
        lastSeenAt: new Date('2026-07-10T11:59:30.000Z'),
        name: 'Pixel',
        platform: DevicePlatform.ANDROID,
        registeredSessionId: 'session-android',
        remoteCommands: [],
        remoteControlEnabled: true,
        revokedAt: null,
        state: null,
        userId: 'user-1',
      },
    ];
  }

  readonly authAuditLog = {
    create: async (args: { data: Record<string, unknown> }) => ({
      createdAt: new Date(),
      id: 'audit-1',
      ...args.data,
    }),
  };

  readonly authRateLimit = {
    deleteMany: async () => ({ count: 0 }),
    findUnique: async () => null,
    update: async () => {
      throw new Error('unexpected auth rate-limit update');
    },
    upsert: async () => {
      throw new Error('unexpected auth rate-limit upsert');
    },
  };

  readonly user = {
    findUnique: async (args: { where: { id?: string; username?: string } }) => {
      if (args.where.id === 'user-1' || args.where.username === 'alice') {
        return {
          id: 'user-1',
          passwordHash: this.passwordHash,
          totpEnabledAt: null,
          totpSecretEncrypted: null,
          username: 'alice',
        };
      }

      return null;
    },
  };

  readonly session = {
    findFirst: async (args: { where: SessionWhere }) =>
      this.sessions.find((session) => matchesSession(session, args.where)) ??
      null,
    findMany: async (args: { where: SessionWhere }) =>
      this.sessions.filter((session) => matchesSession(session, args.where)),
    findUnique: async (args: { where: SessionWhere }) =>
      this.sessions.find((session) => matchesSession(session, args.where)) ??
      null,
    updateMany: async (args: {
      data: { revokedAt?: Date };
      where: SessionWhere;
    }) => {
      const matching = this.sessions.filter((session) =>
        matchesSession(session, args.where),
      );
      for (const session of matching) {
        if (args.data.revokedAt != null) {
          session.revokedAt = args.data.revokedAt;
        }
      }
      return { count: matching.length };
    },
  };

  readonly device = {
    findFirst: async (args: { where: DeviceWhere }) =>
      this.devices.find((device) => matchesDevice(device, args.where)) ?? null,
    findMany: async (args: { where: DeviceWhere }) =>
      this.devices.filter((device) => matchesDevice(device, args.where)),
    findUniqueOrThrow: async (args: { where: { id: string } }) => {
      const device = this.devices.find(
        (candidate) => candidate.id === args.where.id,
      );
      if (device == null) {
        throw new Error('device not found');
      }
      return withLatestCommands(device, this.commands);
    },
    update: async (args: {
      data: Partial<StoredDevice>;
      where: { id: string };
    }) => {
      const device = this.devices.find(
        (candidate) => candidate.id === args.where.id,
      );
      if (device == null) {
        throw new Error('device not found');
      }
      Object.assign(device, args.data);
      return device;
    },
    updateMany: async (args: {
      data: Partial<StoredDevice>;
      where: DeviceWhere;
    }) => {
      const matching = this.devices.filter((device) =>
        matchesDevice(device, args.where),
      );
      for (const device of matching) {
        Object.assign(device, args.data);
      }
      return { count: matching.length };
    },
    upsert: async (args: {
      create: Partial<StoredDevice> & {
        clientDeviceId: string;
        userId: string;
      };
      update: Partial<StoredDevice>;
      where: {
        userId_clientDeviceId: { clientDeviceId: string; userId: string };
      };
    }) => {
      const key = args.where.userId_clientDeviceId;
      const existing = this.devices.find(
        (device) =>
          device.userId === key.userId &&
          device.clientDeviceId === key.clientDeviceId,
      );
      if (existing != null) {
        Object.assign(existing, args.update);
        return existing;
      }

      const created: StoredDevice = {
        appVersion: args.create.appVersion ?? null,
        clientDeviceId: key.clientDeviceId,
        createdAt: new Date(),
        id: `device-${this.devices.length + 1}`,
        lastSeenAt: args.create.lastSeenAt ?? new Date(),
        name: args.create.name ?? 'Android device',
        platform: DevicePlatform.ANDROID,
        registeredSessionId: args.create.registeredSessionId ?? null,
        remoteCommands: [],
        remoteControlEnabled: args.create.remoteControlEnabled ?? false,
        revokedAt: args.create.revokedAt ?? null,
        state: null,
        userId: key.userId,
      };
      this.devices.push(created);
      return created;
    },
  };

  readonly deviceState = {
    upsert: async (args: {
      create: { lastReportedAt: Date; playbackState: PlaybackState };
      update: { lastReportedAt: Date; playbackState: PlaybackState };
      where: { deviceId: string };
    }) => {
      const device = this.devices.find(
        (candidate) => candidate.id === args.where.deviceId,
      );
      if (device == null) {
        throw new Error('device not found');
      }
      device.state = { ...args.update };
      return { deviceId: device.id, ...device.state };
    },
  };

  readonly remoteCommand = {
    updateMany: async (args: {
      data: { errorMessage?: string; status?: RemoteCommandStatus };
      where: {
        deviceId?: string | { in?: string[] };
        status?: RemoteCommandStatus;
        userId?: string;
      };
    }) => {
      const matching = this.commands.filter((command) => {
        const deviceIds =
          typeof args.where.deviceId === 'object'
            ? args.where.deviceId.in
            : args.where.deviceId == null
              ? undefined
              : [args.where.deviceId];
        return (
          (deviceIds == null || deviceIds.includes(command.deviceId)) &&
          (args.where.status == null || command.status === args.where.status) &&
          (args.where.userId == null || command.userId === args.where.userId)
        );
      });
      for (const command of matching) {
        if (args.data.status != null) {
          command.status = args.data.status;
        }
        if (args.data.errorMessage !== undefined) {
          command.errorMessage = args.data.errorMessage;
        }
      }
      return { count: matching.length };
    },
  };

  async $transaction<T>(callback: (tx: this) => Promise<T>): Promise<T> {
    return callback(this);
  }
}

describe('account security flow (e2e)', () => {
  let container: Container;
  let server: ReturnType<typeof createAdaptorServer>;
  let accessTokenService: AccessTokenService;
  let prisma: FakeAccountSecurityPrisma;

  beforeAll(async () => {
    process.env.AUTH_ACCESS_TOKEN_SECRET = 'account-security-e2e-secret';
    process.env.AUTH_ACCESS_TOKEN_TTL_SECONDS = '900';
    prisma = new FakeAccountSecurityPrisma(
      await hash('admin', { type: argon2id }),
    );
    jest.useFakeTimers().setSystemTime(new Date('2026-07-10T12:00:00.000Z'));
    container = createContainer({
      prismaService: prisma as unknown as PrismaService,
    });
    server = createAdaptorServer(createApp(container));
    accessTokenService = container.accessTokenService;
  });

  afterAll(async () => {
    jest.useRealTimers();
    server.close();
  });

  it('lists, reports, revokes, rejects old access, and re-registers with a new session', async () => {
    const webToken = issueToken(accessTokenService, 'session-web');
    const androidToken = issueToken(accessTokenService, 'session-android');
    const newAndroidToken = issueToken(accessTokenService, 'session-new');

    const listResponse = await request(server)
      .get('/auth/sessions')
      .set('Authorization', `Bearer ${webToken}`)
      .expect(200);
    const listBody = listResponse.body as {
      sessions: Array<{ id: string; isCurrent: boolean }>;
    };
    expect(listBody.sessions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'session-web', isCurrent: true }),
        expect.objectContaining({ id: 'session-android', isCurrent: false }),
      ]),
    );

    const stateResponse = await request(server)
      .post('/devices/device-1/state')
      .set('Authorization', `Bearer ${androidToken}`)
      .send({ clientDeviceId: 'client-1', playbackState: 'ROUTE' })
      .expect(201);
    const stateBody = stateResponse.body as {
      state: { playbackState: string };
    };
    expect(stateBody.state.playbackState).toBe('ROUTE');

    await request(server)
      .post('/auth/sessions/session-android/revoke')
      .set('Authorization', `Bearer ${webToken}`)
      .send({ currentPassword: 'admin' })
      .expect(201);
    expect(prisma.commands[0]).toMatchObject({
      status: RemoteCommandStatus.EXPIRED,
    });

    await request(server)
      .post('/devices/device-1/commands/poll')
      .set('Authorization', `Bearer ${androidToken}`)
      .send({ clientDeviceId: 'client-1' })
      .expect(401);

    const registerResponse = await request(server)
      .post('/devices/register')
      .set('Authorization', `Bearer ${newAndroidToken}`)
      .send({
        appVersion: '0.6.0',
        clientDeviceId: 'client-1',
        name: 'Pixel',
        remoteControlEnabled: true,
      })
      .expect(201);
    const registerBody = registerResponse.body as {
      id: string;
      remoteControlEnabled: boolean;
      revokedAt: string | null;
    };
    expect(registerBody).toMatchObject({
      id: 'device-1',
      remoteControlEnabled: true,
      revokedAt: null,
    });
    expect(prisma.devices[0]).toMatchObject({
      registeredSessionId: 'session-new',
      revokedAt: null,
    });

    await request(server)
      .post('/devices/device-1/revoke')
      .set('Authorization', `Bearer ${webToken}`)
      .send({ currentPassword: 'admin' })
      .expect(201);
    await request(server)
      .post('/devices/device-1/state')
      .set('Authorization', `Bearer ${newAndroidToken}`)
      .send({ clientDeviceId: 'client-1', playbackState: 'IDLE' })
      .expect(401);
  });
});

function createSession(
  id: string,
  expiresAt: Date,
  userAgent: string,
): StoredSession {
  return {
    createdAt: new Date('2026-07-01T12:00:00.000Z'),
    expiresAt,
    id,
    ipAddress: '127.0.0.1',
    lastUsedAt: new Date('2026-07-10T11:00:00.000Z'),
    refreshTokenHash: `${id}-refresh-hash`,
    revokedAt: null,
    userAgent,
    userId: 'user-1',
  };
}

function matchesSession(session: StoredSession, where: SessionWhere): boolean {
  const ids = typeof where.id === 'string' ? [where.id] : where.id?.in;
  const excludedId = typeof where.id === 'object' ? where.id.not : undefined;
  return (
    (ids == null || ids.includes(session.id)) &&
    (excludedId == null || session.id !== excludedId) &&
    (where.refreshTokenHash == null ||
      session.refreshTokenHash === where.refreshTokenHash) &&
    (where.userId == null || session.userId === where.userId) &&
    (where.revokedAt !== null || session.revokedAt == null) &&
    (where.expiresAt?.gt == null || session.expiresAt > where.expiresAt.gt)
  );
}

function matchesDevice(device: StoredDevice, where: DeviceWhere): boolean {
  const ids = typeof where.id === 'string' ? [where.id] : where.id?.in;
  return (
    (ids == null || ids.includes(device.id)) &&
    (where.clientDeviceId == null ||
      device.clientDeviceId === where.clientDeviceId) &&
    (where.userId == null || device.userId === where.userId) &&
    (where.platform == null || device.platform === where.platform) &&
    (where.revokedAt !== null || device.revokedAt == null) &&
    (where.registeredSessionId?.in == null ||
      (device.registeredSessionId != null &&
        where.registeredSessionId.in.includes(device.registeredSessionId)))
  );
}

function withLatestCommands(
  device: StoredDevice,
  commands: StoredCommand[],
): StoredDevice {
  return {
    ...device,
    remoteCommands: commands.filter(
      (command) => command.deviceId === device.id,
    ),
  };
}

function issueToken(
  accessTokenService: AccessTokenService,
  sessionId: string,
): string {
  return accessTokenService.issueToken(
    { sessionId, userId: 'user-1' },
    new Date(),
  ).token;
}
