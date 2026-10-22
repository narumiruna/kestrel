import { Hono } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import {
  type AuthVariables,
  getAuthenticatedSessionId,
  getAuthenticatedUserId,
} from '../auth/auth-request';
import type { SessionAuth } from '../auth/session-auth.middleware';
import { HttpException } from '../http/errors';
import { readJsonBody } from '../http/handlers';
import { AiSettingsService } from './ai-settings.service';

export function createAiSettingsRoutes(
  service: AiSettingsService,
  sessionAuth: SessionAuth,
) {
  const routes = new Hono<{ Variables: AuthVariables }>();
  routes.use('/ai/*', async (context, next) => {
    context.header('Cache-Control', 'no-store');
    context.header('Referrer-Policy', 'no-referrer');
    await next();
  });
  routes.onError((error, context) => {
    if (error instanceof HttpException) {
      const response = error.getResponse();
      return context.json(
        typeof response === 'string' ? { message: response } : response,
        error.getStatus() as ContentfulStatusCode,
      );
    }
    // Provider and storage exceptions can carry secrets. Log status/path only in the outer middleware.
    return context.json(
      {
        code: 'AI_SERVICE_UNAVAILABLE',
        message: 'AI_SERVICE_UNAVAILABLE',
        statusCode: 503,
      },
      503,
    );
  });
  routes.get('/ai/oauth/openrouter/callback/:id', async (context) => {
    const url = await service.callback(context.req.param('id'), {
      state: context.req.query('state'),
      code: context.req.query('code'),
      error: context.req.query('error'),
    });
    return context.redirect(url, 303);
  });
  routes.use('/ai/catalog', sessionAuth);
  routes.use('/ai/settings', sessionAuth);
  routes.use('/ai/connections/*', sessionAuth);
  routes.use('/ai/authorizations/*', sessionAuth);
  const owner = (context: Parameters<typeof getAuthenticatedUserId>[0]) =>
    [
      getAuthenticatedUserId(context),
      getAuthenticatedSessionId(context),
    ] as const;
  routes.get('/ai/catalog', async (context) => {
    await service.store(...owner(context)).assertSession();
    return context.json(await service.catalog.catalog());
  });
  routes.get('/ai/settings', async (context) =>
    context.json(await service.settings(...owner(context))),
  );
  routes.put('/ai/settings', async (context) =>
    context.json(
      await service.save(...owner(context), await readJsonBody(context)),
    ),
  );
  routes.post('/ai/connections/:providerId', async (context) =>
    context.json(
      await service.connect(
        ...owner(context),
        context.req.param('providerId'),
        await readJsonBody(context),
      ),
    ),
  );
  routes.delete('/ai/connections/:providerId', async (context) =>
    context.json(
      await service.disconnect(
        ...owner(context),
        context.req.param('providerId'),
        await readJsonBody(context),
      ),
    ),
  );
  routes.post('/ai/authorizations/:providerId', async (context) =>
    context.json(
      await service.start(...owner(context), context.req.param('providerId')),
      201,
    ),
  );
  routes.get('/ai/authorizations/:id', async (context) =>
    context.json(
      await service.attempt(...owner(context), context.req.param('id')),
    ),
  );
  routes.delete('/ai/authorizations/:id', async (context) =>
    context.json(
      await service.cancel(...owner(context), context.req.param('id')),
    ),
  );
  routes.post('/ai/authorizations/:id/complete', async (context) =>
    context.json(
      await service.complete(...owner(context), context.req.param('id')),
    ),
  );
  return routes;
}
