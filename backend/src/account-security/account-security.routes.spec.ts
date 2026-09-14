import type { AccountSecurityService } from './account-security.service';
import { createAccountSecurityRoutes } from './account-security.routes';
import { createStubSessionAuth, jsonRequest } from '../test-support/route-test';

const NODE_ENV = { incoming: { socket: { remoteAddress: '127.0.0.1' } } };
const USER_AGENT = { headers: { 'user-agent': 'jest' } };

describe('account security routes', () => {
  let accountSecurityService: {
    exchangeOidcLink: jest.Mock;
    getOidcLinkStatus: jest.Mock;
    listSessions: jest.Mock;
    revokeDevice: jest.Mock;
    revokeOtherSessions: jest.Mock;
    revokeSession: jest.Mock;
    startOidcLink: jest.Mock;
  };
  let routes: ReturnType<typeof createAccountSecurityRoutes>;

  beforeEach(() => {
    accountSecurityService = {
      exchangeOidcLink: jest.fn().mockResolvedValue({ linked: true }),
      getOidcLinkStatus: jest.fn().mockResolvedValue({
        displayName: 'Pocket ID',
        enabled: true,
        linked: false,
      }),
      listSessions: jest.fn().mockResolvedValue({ sessions: [] }),
      revokeDevice: jest.fn().mockResolvedValue({ device: {} }),
      revokeOtherSessions: jest
        .fn()
        .mockResolvedValue({ revokedSessionIds: [] }),
      revokeSession: jest.fn().mockResolvedValue({ session: {} }),
      startOidcLink: jest
        .fn()
        .mockResolvedValue({ authorizationUrl: 'https://id.test' }),
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

  it('gets OIDC link status using the verified user', async () => {
    const response = await routes.request(
      '/auth/oidc/link',
      USER_AGENT,
      NODE_ENV,
    );

    expect(response.status).toBe(200);
    expect(accountSecurityService.getOidcLinkStatus).toHaveBeenCalledWith(
      'user-1',
    );
  });

  it('starts and exchanges OIDC links using verified session claims', async () => {
    const startBody = {
      clientNonce: 'link-attempt:1234567890abcdef',
      currentPassword: 'admin',
    };
    const exchangeBody = {
      clientNonce: 'link-attempt:1234567890abcdef',
      exchangeTicket: 'exchange-ticket-value-1234567890123456',
    };

    const startResponse = await routes.request(
      '/auth/oidc/link/start',
      {
        ...jsonRequest(startBody),
        headers: { ...jsonRequest(startBody).headers, ...USER_AGENT.headers },
      },
      NODE_ENV,
    );
    const exchangeResponse = await routes.request(
      '/auth/oidc/link/exchange',
      {
        ...jsonRequest(exchangeBody),
        headers: {
          ...jsonRequest(exchangeBody).headers,
          ...USER_AGENT.headers,
        },
      },
      NODE_ENV,
    );

    expect(startResponse.status).toBe(201);
    expect(exchangeResponse.status).toBe(201);
    expect(accountSecurityService.startOidcLink).toHaveBeenCalledWith(
      'user-1',
      'session-current',
      startBody,
      { ipAddress: '127.0.0.1', userAgent: 'jest' },
    );
    expect(accountSecurityService.exchangeOidcLink).toHaveBeenCalledWith(
      'user-1',
      'session-current',
      exchangeBody,
      { ipAddress: '127.0.0.1', userAgent: 'jest' },
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
