import { Hono } from 'hono';
import {
  type AuthVariables,
  getAuthenticatedSessionId,
  getAuthenticatedUserId,
  getRequestMetadata,
} from '../auth/auth-request';
import type { SessionAuth } from '../auth/session-auth.middleware';
import { readJsonBody } from '../http/handlers';
import { AccountSecurityService } from './account-security.service';

export function createAccountSecurityRoutes(
  accountSecurityService: AccountSecurityService,
  sessionAuth: SessionAuth,
): Hono<{ Variables: AuthVariables }> {
  const routes = new Hono<{ Variables: AuthVariables }>();

  routes.get('/auth/sessions', sessionAuth, async (context) =>
    context.json(
      await accountSecurityService.listSessions(
        getAuthenticatedUserId(context),
        getAuthenticatedSessionId(context),
      ),
    ),
  );

  routes.post('/auth/sessions/revoke-others', sessionAuth, async (context) =>
    context.json(
      await accountSecurityService.revokeOtherSessions(
        getAuthenticatedUserId(context),
        getAuthenticatedSessionId(context),
        await readJsonBody(context),
        getRequestMetadata(context),
      ),
      201,
    ),
  );

  routes.post(
    '/auth/sessions/:sessionId/revoke',
    sessionAuth,
    async (context) =>
      context.json(
        await accountSecurityService.revokeSession(
          getAuthenticatedUserId(context),
          getAuthenticatedSessionId(context),
          context.req.param('sessionId'),
          await readJsonBody(context),
          getRequestMetadata(context),
        ),
        201,
      ),
  );

  routes.post('/devices/:deviceId/revoke', sessionAuth, async (context) =>
    context.json(
      await accountSecurityService.revokeDevice(
        getAuthenticatedUserId(context),
        getAuthenticatedSessionId(context),
        context.req.param('deviceId'),
        await readJsonBody(context),
        getRequestMetadata(context),
      ),
      201,
    ),
  );

  return routes;
}
