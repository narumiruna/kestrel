import { Hono } from 'hono';
import type { AuthVariables } from '../auth/auth-request';
import { handleError } from '../http/handlers';
import { createStubSessionAuth, jsonRequest } from '../test-support/route-test';
import { createAndroidLoginRoutes } from './android-login.routes';
import type { AndroidLoginService } from './android-login.service';

const ATTEMPT_ID = '11111111-1111-4111-8111-111111111111';

describe('Android login routes', () => {
  let service: Record<string, jest.Mock>;
  let app: Hono<{ Variables: AuthVariables }>;

  beforeEach(() => {
    service = {
      approveAttempt: jest.fn().mockResolvedValue({ status: 'approved' }),
      claimAttempt: jest.fn().mockResolvedValue({
        attemptId: ATTEMPT_ID,
        matchingCode: '123-456',
      }),
      createAttempt: jest.fn().mockResolvedValue({
        attemptId: ATTEMPT_ID,
        qrCodeDataUrl: 'data:image/png;base64,abc',
      }),
      denyAttempt: jest.fn().mockResolvedValue({ status: 'denied' }),
      exchangeAttempt: jest.fn(),
      getAttempt: jest.fn().mockResolvedValue({ status: 'pending' }),
    };
    app = new Hono<{ Variables: AuthVariables }>();
    app.route(
      '/',
      createAndroidLoginRoutes(
        service as unknown as AndroidLoginService,
        createStubSessionAuth(),
      ),
    );
    app.onError(handleError);
  });

  it('binds Web creation and status to authenticated claims with no-store', async () => {
    const createResponse = await app.request(
      '/auth/android-login-attempts',
      jsonRequest({}),
    );
    expect(createResponse.status).toBe(201);
    expect(createResponse.headers.get('cache-control')).toBe('no-store');
    expect(service.createAttempt).toHaveBeenCalledWith(
      'user-1',
      'session-1',
      expect.objectContaining({ userAgent: undefined }),
    );

    const statusResponse = await app.request(
      `/auth/android-login-attempts/${ATTEMPT_ID}`,
    );
    expect(statusResponse.status).toBe(200);
    expect(statusResponse.headers.get('cache-control')).toBe('no-store');
    expect(service.getAttempt).toHaveBeenCalledWith(
      'user-1',
      'session-1',
      ATTEMPT_ID,
    );
  });

  it('binds Web approval and denial to the originating claims', async () => {
    await app.request(
      `/auth/android-login-attempts/${ATTEMPT_ID}/approve`,
      jsonRequest({}),
    );
    await app.request(
      `/auth/android-login-attempts/${ATTEMPT_ID}/deny`,
      jsonRequest({}),
    );

    expect(service.approveAttempt).toHaveBeenCalledWith(
      'user-1',
      'session-1',
      ATTEMPT_ID,
      expect.any(Object),
    );
    expect(service.denyAttempt).toHaveBeenCalledWith(
      'user-1',
      'session-1',
      ATTEMPT_ID,
      expect.any(Object),
    );
  });

  it('allows public Android claim while taking the attempt ID only from the path', async () => {
    const response = await app.request(
      `/auth/android-login-attempts/${ATTEMPT_ID}/claim`,
      jsonRequest({
        attemptId: 'body-value-is-ignored',
        deviceName: 'Pixel',
        qrSecret: 'secret',
      }),
    );

    expect(response.status).toBe(201);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(service.claimAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ attemptId: ATTEMPT_ID }),
      expect.any(Object),
    );
  });

  it.each([
    {
      expectedBody: { retryAfterSeconds: 5, status: 'pending' },
      expectedStatus: 202,
      result: { retryAfterSeconds: 5, status: 'pending' },
    },
    {
      expectedBody: { retryAfterSeconds: 5, status: 'slow_down' },
      expectedStatus: 429,
      result: { retryAfterSeconds: 5, status: 'slow_down' },
    },
  ])(
    'maps $result.status exchange polling to $expectedStatus with Retry-After',
    async ({ expectedBody, expectedStatus, result }) => {
      service.exchangeAttempt.mockResolvedValue(result);

      const response = await app.request(
        `/auth/android-login-attempts/${ATTEMPT_ID}/exchange`,
        jsonRequest({ qrSecret: 'secret', verifier: 'verifier' }),
      );

      expect(response.status).toBe(expectedStatus);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(response.headers.get('retry-after')).toBe('5');
      await expect(response.json()).resolves.toEqual(expectedBody);
    },
  );

  it('returns the existing auth session response when exchange completes', async () => {
    service.exchangeAttempt.mockResolvedValue({
      session: { accessToken: 'access-token', refreshToken: 'refresh-token' },
      status: 'complete',
    });

    const response = await app.request(
      `/auth/android-login-attempts/${ATTEMPT_ID}/exchange`,
      jsonRequest({ qrSecret: 'secret', verifier: 'verifier' }),
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    });
  });
});
