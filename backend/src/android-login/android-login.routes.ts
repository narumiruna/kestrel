import { Hono } from 'hono';
import {
  type AuthVariables,
  getAuthenticatedSessionId,
  getAuthenticatedUserId,
  getRequestMetadata,
} from '../auth/auth-request';
import type { SessionAuth } from '../auth/session-auth.middleware';
import { readJsonBody } from '../http/handlers';
import { AndroidLoginService } from './android-login.service';

export function createAndroidLoginRoutes(
  service: AndroidLoginService,
  sessionAuth: SessionAuth,
): Hono<{ Variables: AuthVariables }> {
  const routes = new Hono<{ Variables: AuthVariables }>();

  routes.use('*', async (context, next) => {
    context.header('Cache-Control', 'no-store');
    await next();
  });

  routes.post('/auth/android-login-attempts', sessionAuth, async (context) =>
    context.json(
      await service.createAttempt(
        getAuthenticatedUserId(context),
        getAuthenticatedSessionId(context),
        getRequestMetadata(context),
      ),
      201,
    ),
  );

  routes.get(
    '/auth/android-login-attempts/:attemptId',
    sessionAuth,
    async (context) =>
      context.json(
        await service.getAttempt(
          getAuthenticatedUserId(context),
          getAuthenticatedSessionId(context),
          context.req.param('attemptId'),
        ),
      ),
  );

  routes.post(
    '/auth/android-login-attempts/:attemptId/approve',
    sessionAuth,
    async (context) =>
      context.json(
        await service.approveAttempt(
          getAuthenticatedUserId(context),
          getAuthenticatedSessionId(context),
          context.req.param('attemptId'),
          getRequestMetadata(context),
        ),
        201,
      ),
  );

  routes.post(
    '/auth/android-login-attempts/:attemptId/deny',
    sessionAuth,
    async (context) =>
      context.json(
        await service.denyAttempt(
          getAuthenticatedUserId(context),
          getAuthenticatedSessionId(context),
          context.req.param('attemptId'),
          getRequestMetadata(context),
        ),
        201,
      ),
  );

  routes.post(
    '/auth/android-login-attempts/:attemptId/claim',
    async (context) =>
      context.json(
        await service.claimAttempt(
          withAttemptId(
            await readJsonBody(context),
            context.req.param('attemptId'),
          ),
          getRequestMetadata(context),
        ),
        201,
      ),
  );

  routes.post(
    '/auth/android-login-attempts/:attemptId/exchange',
    async (context) => {
      const result = await service.exchangeAttempt(
        withAttemptId(
          await readJsonBody(context),
          context.req.param('attemptId'),
        ),
        getRequestMetadata(context),
      );
      if (result.status === 'complete') {
        return context.json(result.session, 201);
      }

      context.header('Retry-After', result.retryAfterSeconds.toString());
      return context.json(
        {
          retryAfterSeconds: result.retryAfterSeconds,
          status: result.status,
        },
        result.status === 'pending' ? 202 : 429,
      );
    },
  );

  return routes;
}

function withAttemptId(input: unknown, attemptId: string): unknown {
  if (input == null || typeof input !== 'object' || Array.isArray(input)) {
    return input;
  }
  return { ...(input as Record<string, unknown>), attemptId };
}
