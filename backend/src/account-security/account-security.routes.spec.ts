import type { AccountSecurityService } from './account-security.service';
import { createAccountSecurityRoutes } from './account-security.routes';
import { createStubSessionAuth, jsonRequest } from '../test-support/route-test';

const NODE_ENV = { incoming: { socket: { remoteAddress: '127.0.0.1' } } };
const USER_AGENT = { headers: { 'user-agent': 'jest' } };

describe('account security routes', () => {
  let accountSecurityService: {
    listSessions: jest.Mock;
    revokeDevice: jest.Mock;
    revokeOtherSessions: jest.Mock;
    revokeSession: jest.Mock;
  };
  let routes: ReturnType<typeof createAccountSecurityRoutes>;

  beforeEach(() => {
    accountSecurityService = {
      listSessions: jest.fn().mockResolvedValue({ sessions: [] }),
      revokeDevice: jest.fn().mockResolvedValue({ device: {} }),
      revokeOtherSessions: jest
        .fn()
        .mockResolvedValue({ revokedSessionIds: [] }),
      revokeSession: jest.fn().mockResolvedValue({ session: {} }),
    };
    routes = createAccountSecurityRoutes(
      accountSecurityService as unknown as AccountSecurityService,
      createStubSessionAuth({
        expiresAt: new Date('2026-07-10T12:15:00.000Z'),
        sessionId: 'session-current',
        userId: 'user-1',
      }),
    );
  });

  it('lists sessions using verified user and session claims', async () => {
    const response = await routes.request(
      '/auth/sessions',
      USER_AGENT,
      NODE_ENV,
    );

    expect(response.status).toBe(200);
    expect(accountSecurityService.listSessions).toHaveBeenCalledWith(
      'user-1',
      'session-current',
    );
  });

  it('passes step-up metadata when revoking another session', async () => {
    const body = { currentPassword: 'admin' };

    const response = await routes.request(
      '/auth/sessions/session-2/revoke',
      {
        ...jsonRequest(body),
        headers: { ...jsonRequest(body).headers, ...USER_AGENT.headers },
      },
      NODE_ENV,
    );

    expect(response.status).toBe(201);
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

    await routes.request(
      '/devices/device-1/revoke',
      {
        ...jsonRequest(body),
        headers: { ...jsonRequest(body).headers, ...USER_AGENT.headers },
      },
      NODE_ENV,
    );

    expect(accountSecurityService.revokeDevice).toHaveBeenCalledWith(
      'user-1',
      'session-current',
      'device-1',
      body,
      { ipAddress: '127.0.0.1', userAgent: 'jest' },
    );
  });
});
