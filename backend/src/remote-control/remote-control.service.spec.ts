import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import {
  DevicePlatform,
  RemoteCommandStatus,
  RemoteCommandType,
  RouteMode,
  type Prisma,
} from '@prisma/client';
import { RemoteControlService } from './remote-control.service';

type MockRemoteCommandRecord = {
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

type MockRemoteDeviceRecord = {
  appVersion: string | null;
  createdAt: Date;
  id: string;
  lastSeenAt: Date;
  name: string;
  platform: DevicePlatform;
  remoteCommands: MockRemoteCommandRecord[];
  remoteControlEnabled: boolean;
};

type MockTransactionClient = {
  device: MockPrismaService['device'];
  remoteCommand: MockPrismaService['remoteCommand'];
};

type MockPrismaService = {
  $transaction: jest.Mock<
    Promise<unknown>,
    [
      (
        callback: (tx: MockTransactionClient) => Promise<unknown>,
      ) => Promise<unknown>,
    ]
  >;
  device: {
    findFirst: jest.Mock<
      Promise<{ id: string; remoteControlEnabled: boolean } | null>,
      [unknown]
    >;
    findMany: jest.Mock<Promise<MockRemoteDeviceRecord[]>, [unknown]>;
    findUniqueOrThrow: jest.Mock<Promise<MockRemoteDeviceRecord>, [unknown]>;
    update: jest.Mock<Promise<{ id: string }>, [unknown]>;
    upsert: jest.Mock<Promise<MockRemoteDeviceRecord>, [unknown]>;
  };
  remoteCommand: {
    create: jest.Mock<Promise<MockRemoteCommandRecord>, [unknown]>;
    findFirst: jest.Mock<Promise<MockRemoteCommandRecord | null>, [unknown]>;
    findMany: jest.Mock<Promise<MockRemoteCommandRecord[]>, [unknown]>;
    update: jest.Mock<Promise<MockRemoteCommandRecord>, [unknown]>;
    updateMany: jest.Mock<Promise<{ count: number }>, [unknown]>;
  };
};

describe('RemoteControlService', () => {
  let prismaService: MockPrismaService;
  let remoteControlService: RemoteControlService;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-06-20T08:00:00.000Z'));
    prismaService = createMockPrismaService();
    prismaService.$transaction.mockImplementation((callback) =>
      callback({
        device: prismaService.device,
        remoteCommand: prismaService.remoteCommand,
      }),
    );
    remoteControlService = new RemoteControlService(prismaService as never);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('upserts one Android device by user and client device id', async () => {
    const device = createRemoteDeviceRecord({ remoteControlEnabled: true });
    prismaService.device.upsert.mockResolvedValue(device);
    prismaService.device.findUniqueOrThrow.mockResolvedValue(device);

    const result = await remoteControlService.registerDevice('user-1', {
      appVersion: '1.2.3',
      clientDeviceId: 'android-stable-id',
      name: 'Pixel',
      remoteControlEnabled: true,
    });

    expect(result).toMatchObject({
      id: 'device-1',
      online: true,
      remoteControlEnabled: true,
    });
    expect(prismaService.device.upsert.mock.calls[0]?.[0]).toMatchObject({
      create: {
        clientDeviceId: 'android-stable-id',
        platform: DevicePlatform.ANDROID,
        userId: 'user-1',
      },
      update: {
        remoteControlEnabled: true,
      },
      where: {
        userId_clientDeviceId: {
          clientDeviceId: 'android-stable-id',
          userId: 'user-1',
        },
      },
    });
  });

  it('expires stale commands before returning a registered device', async () => {
    prismaService.device.upsert.mockResolvedValue(
      createRemoteDeviceRecord({
        remoteCommands: [
          createRemoteCommandRecord({
            expiresAt: new Date('2026-06-20T07:59:59.000Z'),
            status: RemoteCommandStatus.QUEUED,
          }),
        ],
        remoteControlEnabled: true,
      }),
    );
    prismaService.device.findUniqueOrThrow.mockResolvedValue(
      createRemoteDeviceRecord({
        remoteCommands: [
          createRemoteCommandRecord({
            errorMessage: 'command expired before delivery',
            expiresAt: new Date('2026-06-20T07:59:59.000Z'),
            status: RemoteCommandStatus.EXPIRED,
          }),
        ],
        remoteControlEnabled: true,
      }),
    );

    const result = await remoteControlService.registerDevice('user-1', {
      appVersion: '1.2.3',
      clientDeviceId: 'android-stable-id',
      name: 'Pixel',
      remoteControlEnabled: true,
    });

    expect(result).toMatchObject({
      lastCommand: { status: RemoteCommandStatus.EXPIRED },
      remoteControlEnabled: true,
    });
    expect(
      prismaService.remoteCommand.updateMany.mock.calls[0]?.[0],
    ).toMatchObject({
      where: {
        deviceId: 'device-1',
        expiresAt: { lte: new Date('2026-06-20T08:00:00.000Z') },
        status: RemoteCommandStatus.QUEUED,
        userId: 'user-1',
      },
    });
  });

  it('expires queued commands when Android disables remote control', async () => {
    prismaService.device.upsert.mockResolvedValue(
      createRemoteDeviceRecord({
        remoteCommands: [
          createRemoteCommandRecord({ status: RemoteCommandStatus.QUEUED }),
        ],
        remoteControlEnabled: false,
      }),
    );
    prismaService.device.findUniqueOrThrow.mockResolvedValue(
      createRemoteDeviceRecord({
        remoteCommands: [
          createRemoteCommandRecord({
            errorMessage: 'remote control disabled',
            status: RemoteCommandStatus.EXPIRED,
          }),
        ],
        remoteControlEnabled: false,
      }),
    );

    const result = await remoteControlService.registerDevice('user-1', {
      appVersion: '1.2.3',
      clientDeviceId: 'android-stable-id',
      name: 'Pixel',
      remoteControlEnabled: false,
    });

    expect(result).toMatchObject({
      lastCommand: { status: RemoteCommandStatus.EXPIRED },
      remoteControlEnabled: false,
    });
    expect(
      prismaService.remoteCommand.updateMany.mock.calls.at(-1)?.[0],
    ).toMatchObject({
      data: {
        errorMessage: 'remote control disabled',
        status: RemoteCommandStatus.EXPIRED,
      },
      where: {
        deviceId: 'device-1',
        status: RemoteCommandStatus.QUEUED,
        userId: 'user-1',
      },
    });
  });

  it('rejects command creation for a disabled device', async () => {
    prismaService.device.findFirst.mockResolvedValue({
      id: 'device-1',
      remoteControlEnabled: false,
    });

    await expect(
      remoteControlService.createCommand('user-1', 'device-1', {
        payload: {},
        type: 'STOP',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('rejects command creation for a foreign device', async () => {
    prismaService.device.findFirst.mockResolvedValue(null);

    await expect(
      remoteControlService.createCommand('user-1', 'device-2', {
        payload: {},
        type: 'STOP',
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('validates command payloads before queueing', async () => {
    await expect(
      remoteControlService.createCommand('user-1', 'device-1', {
        payload: {
          point: {
            latitude: 91,
            longitude: 121,
          },
        },
        type: 'SET_POINT',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(prismaService.remoteCommand.create).not.toHaveBeenCalled();
  });

  it('uses payload-specific validation errors', async () => {
    await expect(
      remoteControlService.createCommand('user-1', 'device-1', {
        type: 'SET_POINT',
      }),
    ).rejects.toThrow('payload must be an object');
    await expect(
      remoteControlService.createCommand('user-1', 'device-1', {
        payload: 'bad',
        type: 'START_ROUTE',
      }),
    ).rejects.toThrow('payload must be an object');
    await expect(
      remoteControlService.createCommand('user-1', 'device-1', {
        payload: 'bad',
        type: 'STOP',
      }),
    ).rejects.toThrow('payload must be an object');
  });

  it('rejects caller-supplied expiry beyond the bounded ttl', async () => {
    await expect(
      remoteControlService.createCommand('user-1', 'device-1', {
        expiresAt: '2026-06-20T08:10:00.000Z',
        payload: {},
        type: 'STOP',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(prismaService.remoteCommand.create).not.toHaveBeenCalled();
  });

  it('queues a valid route command with the default expiry', async () => {
    prismaService.device.findFirst.mockResolvedValue({
      id: 'device-1',
      remoteControlEnabled: true,
    });
    prismaService.remoteCommand.create.mockResolvedValue(
      createRemoteCommandRecord({
        payload: {
          mode: RouteMode.LOOP,
          speedKmh: 12,
          waypoints: [
            { latitude: 25, longitude: 121 },
            { latitude: 26, longitude: 122 },
          ],
        } satisfies Prisma.JsonObject,
        type: RemoteCommandType.START_ROUTE,
      }),
    );

    const result = await remoteControlService.createCommand(
      'user-1',
      'device-1',
      {
        payload: {
          mode: 'LOOP',
          speedKmh: 12,
          waypoints: [
            { latitude: 25, longitude: 121 },
            { latitude: 26, longitude: 122 },
          ],
        },
        type: 'START_ROUTE',
      },
    );

    expect(result).toMatchObject({
      status: RemoteCommandStatus.QUEUED,
      type: RemoteCommandType.START_ROUTE,
    });
    expect(prismaService.device.findFirst.mock.calls[0]?.[0]).toMatchObject({
      where: {
        platform: DevicePlatform.ANDROID,
      },
    });
    expect(prismaService.remoteCommand.create.mock.calls[0]?.[0]).toMatchObject(
      {
        data: {
          expiresAt: new Date('2026-06-20T08:01:00.000Z'),
          type: RemoteCommandType.START_ROUTE,
        },
      },
    );
  });

  it('marks queued commands delivered once during poll', async () => {
    prismaService.device.findFirst.mockResolvedValue({
      id: 'device-1',
      remoteControlEnabled: true,
    });
    prismaService.remoteCommand.findMany.mockResolvedValueOnce([
      createRemoteCommandRecord({ id: 'command-1' }),
    ]);
    prismaService.remoteCommand.updateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 });

    const result = await remoteControlService.pollCommands(
      'user-1',
      'device-1',
      {
        clientDeviceId: 'client-1',
      },
    );

    expect(result).toMatchObject({
      commands: [
        {
          deliveredAt: new Date('2026-06-20T08:00:00.000Z'),
          id: 'command-1',
          status: RemoteCommandStatus.DELIVERED,
        },
      ],
    });
    expect(
      prismaService.remoteCommand.updateMany.mock.calls.at(-1)?.[0],
    ).toMatchObject({
      data: {
        status: RemoteCommandStatus.DELIVERED,
      },
      where: { status: RemoteCommandStatus.QUEUED },
    });
    expect(prismaService.device.update.mock.calls[0]?.[0]).toMatchObject({
      data: { lastSeenAt: new Date('2026-06-20T08:00:00.000Z') },
    });
  });

  it('returns the subset actually delivered when poll delivery races', async () => {
    prismaService.device.findFirst.mockResolvedValue({
      id: 'device-1',
      remoteControlEnabled: true,
    });
    prismaService.remoteCommand.findMany.mockResolvedValueOnce([
      createRemoteCommandRecord({ id: 'command-1' }),
      createRemoteCommandRecord({ id: 'command-2' }),
    ]);
    prismaService.remoteCommand.updateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    const result = await remoteControlService.pollCommands(
      'user-1',
      'device-1',
      {
        clientDeviceId: 'client-1',
      },
    );

    expect(result).toMatchObject({
      commands: [
        {
          id: 'command-1',
          status: RemoteCommandStatus.DELIVERED,
        },
      ],
    });
  });

  it('does not poll commands already delivered', async () => {
    prismaService.device.findFirst.mockResolvedValue({
      id: 'device-1',
      remoteControlEnabled: true,
    });
    prismaService.remoteCommand.findMany.mockResolvedValue([]);

    const result = await remoteControlService.pollCommands(
      'user-1',
      'device-1',
      {
        clientDeviceId: 'client-1',
      },
    );

    expect(result).toMatchObject({ commands: [] });
    expect(
      prismaService.remoteCommand.findMany.mock.calls[0]?.[0],
    ).toMatchObject({
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      where: { status: RemoteCommandStatus.QUEUED },
    });
  });

  it('expires queued commands and returns nothing when remote control is disabled', async () => {
    prismaService.device.findFirst.mockResolvedValue({
      id: 'device-1',
      remoteControlEnabled: false,
    });

    const result = await remoteControlService.pollCommands(
      'user-1',
      'device-1',
      {
        clientDeviceId: 'client-1',
      },
    );

    expect(result).toMatchObject({ commands: [] });
    expect(prismaService.remoteCommand.findMany).not.toHaveBeenCalled();
    expect(
      prismaService.remoteCommand.updateMany.mock.calls.at(-1)?.[0],
    ).toMatchObject({
      data: {
        errorMessage: 'remote control disabled',
        status: RemoteCommandStatus.EXPIRED,
      },
      where: {
        deviceId: 'device-1',
        status: RemoteCommandStatus.QUEUED,
        userId: 'user-1',
      },
    });
  });

  it('expires stale queued commands during poll', async () => {
    prismaService.device.findFirst.mockResolvedValue({
      id: 'device-1',
      remoteControlEnabled: true,
    });
    prismaService.remoteCommand.findMany.mockResolvedValue([]);

    await remoteControlService.pollCommands('user-1', 'device-1', {
      clientDeviceId: 'client-1',
    });

    expect(
      prismaService.remoteCommand.updateMany.mock.calls[0]?.[0],
    ).toMatchObject({
      data: {
        status: RemoteCommandStatus.EXPIRED,
      },
      where: {
        expiresAt: { lte: new Date('2026-06-20T08:00:00.000Z') },
        status: RemoteCommandStatus.QUEUED,
      },
    });
  });

  it('expires queued commands by expiresAt but keeps delivered commands until ack timeout', async () => {
    prismaService.device.findMany.mockResolvedValue([
      createRemoteDeviceRecord({
        lastSeenAt: new Date('2026-06-20T07:58:00.000Z'),
      }),
    ]);

    const result = await remoteControlService.listDevices('user-1');

    expect(result.devices[0]).toMatchObject({ online: false });
    expect(
      prismaService.remoteCommand.updateMany.mock.calls[0]?.[0],
    ).toMatchObject({
      data: {
        status: RemoteCommandStatus.EXPIRED,
      },
      where: {
        expiresAt: { lte: new Date('2026-06-20T08:00:00.000Z') },
        status: RemoteCommandStatus.QUEUED,
      },
    });
    expect(
      prismaService.remoteCommand.updateMany.mock.calls[1]?.[0],
    ).toMatchObject({
      where: {
        deliveredAt: { lte: new Date('2026-06-20T07:58:00.000Z') },
        status: RemoteCommandStatus.DELIVERED,
      },
    });
  });

  it('acks delivered commands as applied', async () => {
    prismaService.device.findFirst.mockResolvedValue({
      id: 'device-1',
      remoteControlEnabled: true,
    });
    prismaService.remoteCommand.findFirst
      .mockResolvedValueOnce(
        createRemoteCommandRecord({
          deliveredAt: new Date('2026-06-20T07:59:00.000Z'),
          status: RemoteCommandStatus.DELIVERED,
        }),
      )
      .mockResolvedValueOnce(
        createRemoteCommandRecord({
          appliedAt: new Date('2026-06-20T08:00:00.000Z'),
          deliveredAt: new Date('2026-06-20T07:59:00.000Z'),
          status: RemoteCommandStatus.APPLIED,
        }),
      );
    prismaService.remoteCommand.updateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 });

    const result = await remoteControlService.ackCommand(
      'user-1',
      'device-1',
      'command-1',
      {
        clientDeviceId: 'client-1',
        status: 'APPLIED',
      },
    );

    expect(result).toMatchObject({
      appliedAt: new Date('2026-06-20T08:00:00.000Z'),
      status: RemoteCommandStatus.APPLIED,
    });
    expect(
      prismaService.remoteCommand.updateMany.mock.calls.at(-1)?.[0],
    ).toMatchObject({
      data: {
        appliedAt: new Date('2026-06-20T08:00:00.000Z'),
        status: RemoteCommandStatus.APPLIED,
      },
      where: {
        deviceId: 'device-1',
        id: 'command-1',
        status: RemoteCommandStatus.DELIVERED,
        userId: 'user-1',
      },
    });
  });

  it('returns terminal command when a racing ack wins first', async () => {
    prismaService.device.findFirst.mockResolvedValue({
      id: 'device-1',
      remoteControlEnabled: true,
    });
    prismaService.remoteCommand.findFirst
      .mockResolvedValueOnce(
        createRemoteCommandRecord({
          deliveredAt: new Date('2026-06-20T07:59:00.000Z'),
          status: RemoteCommandStatus.DELIVERED,
        }),
      )
      .mockResolvedValueOnce(
        createRemoteCommandRecord({
          appliedAt: new Date('2026-06-20T08:00:00.000Z'),
          deliveredAt: new Date('2026-06-20T07:59:00.000Z'),
          status: RemoteCommandStatus.APPLIED,
        }),
      );

    const result = await remoteControlService.ackCommand(
      'user-1',
      'device-1',
      'command-1',
      {
        clientDeviceId: 'client-1',
        status: 'FAILED',
      },
    );

    expect(result).toMatchObject({
      appliedAt: new Date('2026-06-20T08:00:00.000Z'),
      status: RemoteCommandStatus.APPLIED,
    });
  });

  it('acks delivered commands as failed with an error message', async () => {
    prismaService.device.findFirst.mockResolvedValue({
      id: 'device-1',
      remoteControlEnabled: true,
    });
    prismaService.remoteCommand.findFirst
      .mockResolvedValueOnce(
        createRemoteCommandRecord({
          deliveredAt: new Date('2026-06-20T07:59:00.000Z'),
          status: RemoteCommandStatus.DELIVERED,
        }),
      )
      .mockResolvedValueOnce(
        createRemoteCommandRecord({
          errorMessage: 'missing mock permission',
          status: RemoteCommandStatus.FAILED,
        }),
      );
    prismaService.remoteCommand.updateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 });

    const result = await remoteControlService.ackCommand(
      'user-1',
      'device-1',
      'command-1',
      {
        clientDeviceId: 'client-1',
        errorMessage: 'missing mock permission',
        status: 'FAILED',
      },
    );

    expect(result).toMatchObject({
      errorMessage: 'missing mock permission',
      status: RemoteCommandStatus.FAILED,
    });
  });

  it('keeps duplicate terminal ack idempotent', async () => {
    prismaService.device.findFirst.mockResolvedValue({
      id: 'device-1',
      remoteControlEnabled: true,
    });
    prismaService.remoteCommand.findFirst.mockResolvedValue(
      createRemoteCommandRecord({ status: RemoteCommandStatus.APPLIED }),
    );

    const result = await remoteControlService.ackCommand(
      'user-1',
      'device-1',
      'command-1',
      {
        clientDeviceId: 'client-1',
        status: 'APPLIED',
      },
    );

    expect(result).toMatchObject({ status: RemoteCommandStatus.APPLIED });
    expect(prismaService.remoteCommand.updateMany).toHaveBeenCalledTimes(2);
    expect(prismaService.device.update.mock.calls[0]?.[0]).toMatchObject({
      data: { lastSeenAt: new Date('2026-06-20T08:00:00.000Z') },
    });
  });

  it('rejects ack before delivery and foreign device ack', async () => {
    prismaService.device.findFirst.mockResolvedValueOnce({
      id: 'device-1',
      remoteControlEnabled: true,
    });
    prismaService.remoteCommand.findFirst.mockResolvedValue(
      createRemoteCommandRecord({ status: RemoteCommandStatus.QUEUED }),
    );

    await expect(
      remoteControlService.ackCommand('user-1', 'device-1', 'command-1', {
        clientDeviceId: 'client-1',
        status: 'APPLIED',
      }),
    ).rejects.toThrow(ConflictException);

    prismaService.device.findFirst.mockResolvedValueOnce(null);

    await expect(
      remoteControlService.ackCommand('user-1', 'device-2', 'command-1', {
        clientDeviceId: 'client-2',
        status: 'APPLIED',
      }),
    ).rejects.toThrow(NotFoundException);
  });
});

function createMockPrismaService(): MockPrismaService {
  const createMock = <TReturn, TArgs extends unknown[]>() =>
    jest.fn<TReturn, TArgs>();

  return {
    $transaction: createMock<
      Promise<unknown>,
      [
        (
          callback: (tx: MockTransactionClient) => Promise<unknown>,
        ) => Promise<unknown>,
      ]
    >(),
    device: {
      findFirst: createMock<
        Promise<{ id: string; remoteControlEnabled: boolean } | null>,
        [unknown]
      >(),
      findMany: createMock<Promise<MockRemoteDeviceRecord[]>, [unknown]>(),
      findUniqueOrThrow: createMock<
        Promise<MockRemoteDeviceRecord>,
        [unknown]
      >(),
      update: createMock<
        Promise<{ id: string }>,
        [unknown]
      >().mockResolvedValue({ id: 'device-1' }),
      upsert: createMock<Promise<MockRemoteDeviceRecord>, [unknown]>(),
    },
    remoteCommand: {
      create: createMock<Promise<MockRemoteCommandRecord>, [unknown]>(),
      findFirst: createMock<
        Promise<MockRemoteCommandRecord | null>,
        [unknown]
      >(),
      findMany: createMock<Promise<MockRemoteCommandRecord[]>, [unknown]>(),
      update: createMock<Promise<MockRemoteCommandRecord>, [unknown]>(),
      updateMany: createMock<
        Promise<{ count: number }>,
        [unknown]
      >().mockResolvedValue({ count: 0 }),
    },
  };
}

function createRemoteDeviceRecord(
  overrides: Partial<MockRemoteDeviceRecord> = {},
): MockRemoteDeviceRecord {
  return {
    appVersion: '1.2.3',
    createdAt: new Date('2026-06-20T07:55:00.000Z'),
    id: 'device-1',
    lastSeenAt: new Date('2026-06-20T07:59:30.000Z'),
    name: 'Pixel',
    platform: DevicePlatform.ANDROID,
    remoteCommands: [],
    remoteControlEnabled: true,
    ...overrides,
  };
}

function createRemoteCommandRecord(
  overrides: Partial<MockRemoteCommandRecord> = {},
): MockRemoteCommandRecord {
  return {
    appliedAt: null,
    createdAt: new Date('2026-06-20T07:59:00.000Z'),
    deliveredAt: null,
    deviceId: 'device-1',
    errorMessage: null,
    expiresAt: new Date('2026-06-20T08:01:00.000Z'),
    id: 'command-1',
    payload: {},
    status: RemoteCommandStatus.QUEUED,
    type: RemoteCommandType.STOP,
    userId: 'user-1',
    ...overrides,
  };
}
