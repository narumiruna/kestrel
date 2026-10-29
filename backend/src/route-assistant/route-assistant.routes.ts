import { Hono } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import {
  getAuthenticatedSessionId,
  getAuthenticatedUserId,
  type AuthVariables,
} from '../auth/auth-request';
import type { SessionAuth } from '../auth/session-auth.middleware';
import { HttpException } from '../http/errors';
import { readJsonBody } from '../http/handlers';
import {
  RouteAssistantService,
  safeAssistantCode,
} from './route-assistant.service';

export function createRouteAssistantRoutes(
  service: RouteAssistantService,
  sessionAuth: SessionAuth,
) {
  const routes = new Hono<{ Variables: AuthVariables }>();
  routes.use('/ai/route-assistant/*', async (context, next) => {
    context.header('Cache-Control', 'no-store');
    context.header('Referrer-Policy', 'no-referrer');
    await next();
  });
  routes.use('/ai/route-assistant/*', sessionAuth);
  routes.onError((error, context) =>
    context.json(
      { code: safeAssistantCode(error), message: safeAssistantCode(error) },
      (error instanceof HttpException
        ? error.getStatus()
        : 503) as ContentfulStatusCode,
    ),
  );
  routes.post('/ai/route-assistant/runs', async (context) => {
    const body = await service.start(
      getAuthenticatedUserId(context),
      getAuthenticatedSessionId(context),
      await readJsonBody(context),
      context.req.raw.signal,
    );
    return new Response(body, {
      headers: {
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Cache-Control': 'no-store, no-transform',
        'Referrer-Policy': 'no-referrer',
        'X-Accel-Buffering': 'no',
      },
    });
  });
  routes.delete('/ai/route-assistant/runs/:id', async (context) =>
    context.json(
      await service.cancel(
        getAuthenticatedUserId(context),
        getAuthenticatedSessionId(context),
        context.req.param('id'),
      ),
    ),
  );
  return routes;
}
