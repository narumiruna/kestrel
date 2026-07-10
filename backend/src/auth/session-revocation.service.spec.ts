import { RemoteCommandStatus } from '@prisma/client';
import { SessionRevocationService } from './session-revocation.service';

type MockStore = {
  device: {
    findMany: jest.Mock;
    updateMany: jest.Mock;
  };
  remoteCommand: {
    updateMany: jest.Mock;
  };
  session: {
    updateMany: jest.Mock;
  };
};

describe('SessionRevocationService', () => {
  let store: MockStore;
  let service: SessionRevocationService;

  beforeEach(() => {
    store = {
      device: {
        findMany: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      remoteCommand: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      session: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const prisma = {
      ...store,
      $transaction: jest.fn((callback) => callback(store)),
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
