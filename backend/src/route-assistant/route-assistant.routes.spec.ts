import { aiError } from '../ai/ai-errors';
import type { SessionAuth } from '../auth/session-auth.middleware';
import { createStubSessionAuth, jsonRequest } from '../test-support/route-test';
import { fixtureInput } from './route-assistant.fixture';
import { createRouteAssistantRoutes } from './route-assistant.routes';
import type { RouteAssistantService } from './route-assistant.service';

const path = '/ai/route-assistant/runs';
function setup(auth: SessionAuth = createStubSessionAuth()) {
  const start = jest.fn(() =>
    Promise.resolve(
      new ReadableStream<Uint8Array>({
        start(output) {
          output.enqueue(new TextEncoder().encode('{"type":"done"}\n'));
          output.close();
        },
      }),
    ),
  );
  const cancel = jest.fn((userId: string, sessionId: string, runId: string) => {
    if (
      userId !== 'user-1' ||
      sessionId !== 'session-1' ||
      runId !== 'owned-run'
    )
      aiError('RA_RUN_NOT_FOUND', 404);
    return Promise.resolve({ ok: true });
  });
  const routes = createRouteAssistantRoutes(
    { start, cancel } as unknown as RouteAssistantService,
    auth,
  );
  return { routes, start, cancel };
}

describe('route assistant authenticated transport', () => {
  it.each(['POST', 'DELETE'])(
    'requires authentication for %s without invoking service',
    async (method) => {
      const h = setup(() => {
        aiError('AI_SESSION_EXPIRED', 401);
      });
      const response = await h.routes.request(
        method === 'POST' ? path : `${path}/owned-run`,
        { ...jsonRequest(fixtureInput()), method },
      );
      expect(response.status).toBe(401);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(response.headers.get('referrer-policy')).toBe('no-referrer');
      expect(h.start).not.toHaveBeenCalled();
      expect(h.cancel).not.toHaveBeenCalled();
    },
  );

  it('passes authenticated identity, body, and request abort signal and serves unbuffered NDJSON', async () => {
    const h = setup();
    const body = fixtureInput();
    const controller = new AbortController();
    const request = new Request(`http://localhost${path}`, {
      ...jsonRequest(body),
      signal: controller.signal,
    });
    const response = await h.routes.fetch(request);
    expect(response.status).toBe(200);
    expect(h.start).toHaveBeenCalledWith(
      'user-1',
      'session-1',
      body,
      request.signal,
    );
    expect(response.headers.get('content-type')).toBe(
      'application/x-ndjson; charset=utf-8',
    );
    expect(response.headers.get('cache-control')).toBe(
      'no-store, no-transform',
    );
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
    expect(response.headers.get('x-accel-buffering')).toBe('no');
    expect(await response.text()).toBe('{"type":"done"}\n');
    controller.abort();
    expect(h.start.mock.calls[0]).toBeDefined();
  });

  it('uses authenticated ownership for cancellation, never body-supplied identity', async () => {
    const h = setup();
    const response = await h.routes.request(`${path}/owned-run`, {
      ...jsonRequest({ userId: 'victim', sessionId: 'victim' }),
      method: 'DELETE',
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(h.cancel).toHaveBeenCalledWith('user-1', 'session-1', 'owned-run');
  });

  it('does not allow another user or session to cancel an owned run', async () => {
    for (const claims of [
      { userId: 'bob', sessionId: 'session-bob' },
      { userId: 'user-1', sessionId: 'session-other' },
    ]) {
      const h = setup(
        createStubSessionAuth({ ...claims, expiresAt: new Date('2100-01-01') }),
      );
      const response = await h.routes.request(`${path}/owned-run`, {
        method: 'DELETE',
      });
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({
        code: 'RA_RUN_NOT_FOUND',
        message: 'RA_RUN_NOT_FOUND',
      });
      expect(h.cancel).toHaveBeenCalledWith(
        claims.userId,
        claims.sessionId,
        'owned-run',
      );
    }
  });

  it('returns only a safe code when the service throws a raw provider error', async () => {
    const h = setup();
    h.start.mockRejectedValue(
      new Error('secret-token private prompt provider response'),
    );
    const response = await h.routes.request(path, jsonRequest(fixtureInput()));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      code: 'RA_PROVIDER_FAILED',
      message: 'RA_PROVIDER_FAILED',
    });
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
});
