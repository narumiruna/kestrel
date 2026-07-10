import { AccountSecurityController } from './account-security.controller';

describe('AccountSecurityController', () => {
  const request = {
    auth: {
      expiresAt: new Date('2026-07-10T12:15:00.000Z'),
      sessionId: 'session-current',
      userId: 'user-1',
    },
    header: jest.fn().mockReturnValue('jest'),
    ip: '127.0.0.1',
  };
  let accountSecurityService: {
    listSessions: jest.Mock;
    revokeDevice: jest.Mock;
    revokeOtherSessions: jest.Mock;
    revokeSession: jest.Mock;
  };
  let controller: AccountSecurityController;

  beforeEach(() => {
    accountSecurityService = {
      listSessions: jest.fn().mockResolvedValue({ sessions: [] }),
      revokeDevice: jest.fn().mockResolvedValue({ device: {} }),
      revokeOtherSessions: jest
        .fn()
        .mockResolvedValue({ revokedSessionIds: [] }),
      revokeSession: jest.fn().mockResolvedValue({ session: {} }),
    };
    controller = new AccountSecurityController(accountSecurityService as never);
  });

  it('lists sessions using verified user and session claims', async () => {
    await controller.listSessions(request as never);

    expect(accountSecurityService.listSessions).toHaveBeenCalledWith(
      'user-1',
      'session-current',
    );
  });

  it('passes step-up metadata when revoking another session', async () => {
    const body = { currentPassword: 'admin' };

    await controller.revokeSession(request as never, 'session-2', body);

    expect(accountSecurityService.revokeSession).toHaveBeenCalledWith(
      'user-1',
      'session-current',
      'session-2',
      body,
      { ipAddress: '127.0.0.1', userAgent: 'jest' },
    );
  });

  it('passes the current session when revoking a device', async () => {
    const body = { currentPassword: 'admin' };

    await controller.revokeDevice(request as never, 'device-1', body);

    expect(accountSecurityService.revokeDevice).toHaveBeenCalledWith(
      'user-1',
      'session-current',
      'device-1',
      body,
      { ipAddress: '127.0.0.1', userAgent: 'jest' },
    );
  });
});
