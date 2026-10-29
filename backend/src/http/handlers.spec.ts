import { Hono } from 'hono';
import { parseCreateRouteInput } from '../library/library.validation';
import { BadRequestException, GoneException } from './errors';
import {
  enforceBodyLimit,
  handleError,
  handleNotFound,
  readJsonBody,
} from './handlers';

describe('http handlers', () => {
  const app = new Hono();

  app.use('*', enforceBodyLimit);

  app.post('/body', async (context) =>
    context.json(await readJsonBody(context)),
  );
  app.post('/routes', async (context) =>
    context.json(parseCreateRouteInput(await readJsonBody(context))),
  );
  app.patch('/routes/:id', async (context) =>
    context.json(await readJsonBody(context)),
  );
  app.post('/ai/route-assistant/runs', async (context) =>
    context.json(await readJsonBody(context)),
  );
  app.get('/string-error', () => {
    throw new BadRequestException('plain message');
  });
  app.get('/object-error', () => {
    throw new GoneException({ code: 'GONE_CODE', message: 'gone message' });
  });
  app.get('/unhandled', () => {
    throw new Error('boom');
  });
  app.notFound(handleNotFound);
  app.onError(handleError);

  it('treats an empty body as an empty object', async () => {
    const response = await app.request('/body', { method: 'POST' });

    await expect(response.json()).resolves.toEqual({});
  });

  it('rejects a malformed JSON body', async () => {
    const response = await app.request('/body', {
      body: '{bad',
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'Bad Request',
      message: 'request body must be valid JSON',
      statusCode: 400,
    });
  });

  it('rejects a body larger than the 100kb limit', async () => {
    const response = await app.request('/body', {
      body: JSON.stringify({ padding: 'x'.repeat(150 * 1024) }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({
      error: 'Payload Too Large',
      message: 'request entity too large',
      statusCode: 413,
    });
  });

  it('accepts full-precision 1000-point route writes within a separate 256 KiB cap', async () => {
    const waypoints = Array.from({ length: 1000 }, (_, index) => ({
      latitude: 25.0330123456789 + index / 1e10,
      longitude: 121.56541234567891,
      speedKmh: 5.123456789012345,
      pauseSeconds: 2.123456789012345,
    }));
    const input = {
      name: 'Full precision',
      mode: 'ONCE',
      defaultSpeedKmh: 5,
      waypoints,
    };
    const body = JSON.stringify(input);
    expect(Buffer.byteLength(body)).toBeGreaterThan(100 * 1024);
    for (const [method, path] of [
      ['POST', '/routes'],
      ['PATCH', '/routes/route'],
    ] as const) {
      const response = await app.request(path, {
        method,
        body,
        headers: { 'content-type': 'application/json' },
      });
      expect(response.status).toBe(200);
      const result = (await response.json()) as typeof input;
      expect(result.waypoints).toEqual(waypoints);
      const oversized = await app.request(path, {
        method,
        body: JSON.stringify({ padding: 'x'.repeat(256 * 1024) }),
        headers: { 'content-type': 'application/json' },
      });
      expect(oversized.status).toBe(413);
    }
  });

  it.each([
    ['/routes', 256 * 1024],
    ['/ai/route-assistant/runs', 4 * 1024 * 1024],
  ])(
    'counts actual %s bytes despite a misleading Content-Length',
    async (path, limit) => {
      const response = await app.request(path, {
        method: 'POST',
        headers: { 'content-length': '1', 'content-type': 'application/json' },
        body: JSON.stringify({ padding: 'x'.repeat(limit) }),
      });
      expect(response.status).toBe(413);
    },
  );

  it('rejects an oversized chunked body before buffering it', async () => {
    const chunk = new Uint8Array(64 * 1024);
    const response = await app.request('/body', {
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(chunk);
          controller.enqueue(chunk);
          controller.enqueue(chunk);
          controller.close();
        },
      }),
      // @ts-expect-error duplex is required for a streamed request body.
      duplex: 'half',
      headers: { 'transfer-encoding': 'chunked' },
      method: 'POST',
    });

    expect(response.status).toBe(413);
  });

  it('serializes string exception responses with a status code', async () => {
    const response = await app.request('/string-error');

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'Bad Request',
      message: 'plain message',
      statusCode: 400,
    });
  });

  it('passes object exception responses through unchanged', async () => {
    const response = await app.request('/object-error');

    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toEqual({
      code: 'GONE_CODE',
      message: 'gone message',
    });
  });

  it('hides unhandled errors behind a generic 500', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const response = await app.request('/unhandled');

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      message: 'Internal server error',
      statusCode: 500,
    });

    jest.restoreAllMocks();
  });

  it('reports unknown routes with the method and path', async () => {
    const response = await app.request('/missing');

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: 'Not Found',
      message: 'Cannot GET /missing',
      statusCode: 404,
    });
  });
});
