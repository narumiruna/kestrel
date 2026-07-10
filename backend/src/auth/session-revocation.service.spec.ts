import { RemoteCommandStatus } from '@prisma/client';
import { SessionRevocationService } from './session-revocation.service';

type MockDevice = {
  id: string;
  registeredSessionId?: string | null;
};

type MockStore = {
  device: {
    findMany: jest.Mock<Promise<MockDevice[]>, [unknown]>;
    updateMany: jest.Mock<Promise<{ count: number }>, [unknown]>;
  };
  remoteCommand: {
    updateMany: jest.Mock<Promise<{ count: number }>, [unknown]>;
  };
  session: {
    updateMany: jest.Mock<Promise<{ count: number }>, [unknown]>;
  };
};

describe('SessionRevocationService', () => {
  let store: MockStore;
  let service: SessionRevocationService;

  beforeEach(() => {
    store = {
      device: {
        findMany: jest.fn<Promise<MockDevice[]>, [unknown]>(),
        updateMany: jest
          .fn<Promise<{ count: number }>, [unknown]>()
          .mockResolvedValue({ count: 0 }),
      },
      remoteCommand: {
        updateMany: jest
          .fn<Promise<{ count: number }>, [unknown]>()
          .mockResolvedValue({ count: 0 }),
      },
      session: {
        updateMany: jest
          .fn<Promise<{ count: number }>, [unknown]>()
          .mockResolvedValue({ count: 0 }),
      },
    };
    const transaction = jest.fn<
      Promise<unknown>,
      [(callback: (tx: MockStore) => Promise<unknown>) => Promise<unknown>]
    >();
    transaction.mockImplementation((callback) => callback(store));
    const prisma = {
      ...store,
      $transaction: transaction,
    };
    service = new SessionRevocationService(prisma as never);
  });

  it('revokes sessions, linked devices, and only queued commands atomically', async () => {
    const revokedAt = new Date('2026-07-10T12:00:00.000Z');
    store.device.findMany.mockResolvedValue([
      { id: 'device-1' },
      { id: 'device-2' },
    ]);

    await service.revokeSessions('user-1', ['session-2'], revokedAt);

    expect(store.session.updateMany).toHaveBeenCalledWith({
      data: { revokedAt },
      where: {
        id: { in: ['session-2'] },
        revokedAt: null,
        userId: 'user-1',
      },
    });
    expect(store.device.updateMany).toHaveBeenCalledWith({
      data: { remoteControlEnabled: false, revokedAt },
      where: {
        id: { in: ['device-1', 'device-2'] },
        userId: 'user-1',
      },
    });
    expect(store.remoteCommand.updateMany).toHaveBeenCalledWith({
      data: {
        errorMessage: 'device or session revoked',
        status: RemoteCommandStatus.EXPIRED,
      },
      where: {
        deviceId: { in: ['device-1', 'device-2'] },
        status: RemoteCommandStatus.QUEUED,
        userId: 'user-1',
      },
    });
  });

  it('revokes a device and its linked session without touching delivered commands', async () => {
    const revokedAt = new Date('2026-07-10T12:00:00.000Z');
    store.device.findMany.mockResolvedValue([
      { id: 'device-1', registeredSessionId: 'session-android' },
    ]);

    await service.revokeDevice('user-1', 'device-1', revokedAt);

    expect(store.session.updateMany).toHaveBeenCalledWith({
      data: { revokedAt },
      where: {
        id: { in: ['session-android'] },
        revokedAt: null,
        userId: 'user-1',
      },
    });
    expect(store.device.updateMany).toHaveBeenCalledWith({
      data: { remoteControlEnabled: false, revokedAt },
      where: { id: { in: ['device-1'] }, userId: 'user-1' },
    });
    expect(store.remoteCommand.updateMany.mock.calls[0]?.[0]).toMatchObject({
      where: { status: RemoteCommandStatus.QUEUED },
    });
  });
});
