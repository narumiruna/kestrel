import { Hono } from 'hono';
import { readJsonBody } from '../http/handlers';
import {
  type AuthVariables,
  getAuthenticatedUserId,
  getBearerToken,
  getRequestMetadata,
} from './auth-request';
import { AuthService } from './auth.service';
import { PocketIdService } from './pocket-id.service';
import type { SessionAuth } from './session-auth.middleware';

export function createAuthRoutes(
  authService: AuthService,
  pocketIdService: PocketIdService,
  sessionAuth: SessionAuth,
): Hono<{ Variables: AuthVariables }> {
  const routes = new Hono<{ Variables: AuthVariables }>();

  routes.post('/register', async (context) =>
    context.json(await authService.register(await readJsonBody(context)), 201),
  );

  routes.post('/totp/setup', async (context) =>
    context.json(await authService.setupTotp(await readJsonBody(context)), 201),
  );

  routes.post('/totp/verify', async (context) =>
    context.json(
      await authService.verifyTotp(await readJsonBody(context)),
      201,
    ),
  );

  routes.post('/login', async (context) =>
    context.json(
      await authService.login(
        await readJsonBody(context),
        getRequestMetadata(context),
      ),
      201,
    ),
  );

  routes.get('/methods', (context) => {
    context.header('Cache-Control', 'no-store');
    return context.json(pocketIdService.getMethods());
  });

  routes.post('/oidc/pocket-id/start', async (context) => {
    context.header('Cache-Control', 'no-store');
    return context.json(
      await pocketIdService.start(
        await readJsonBody(context),
        getRequestMetadata(context),
      ),
      201,
    );
  });

  routes.get('/oidc/pocket-id/callback', async (context) => {
    context.header('Cache-Control', 'no-store');
    context.header('Referrer-Policy', 'no-referrer');
    return context.redirect(
      await pocketIdService.callback({
        code: context.req.query('code'),
        error: context.req.query('error'),
        state: context.req.query('state'),
      }),
      302,
    );
  });

  routes.post('/oidc/pocket-id/exchange', async (context) => {
    context.header('Cache-Control', 'no-store');
    return context.json(
      await pocketIdService.exchange(
        await readJsonBody(context),
        getRequestMetadata(context),
      ),
      201,
    );
  });

  routes.post('/refresh', async (context) =>
    context.json(
      await authService.refresh(
        await readJsonBody(context),
        getRequestMetadata(context),
      ),
      201,
    ),
  );

  routes.post('/password/change', sessionAuth, async (context) =>
    context.json(
      await authService.changePassword(
        getAuthenticatedUserId(context),
        await readJsonBody(context),
        getRequestMetadata(context),
      ),
      201,
    ),
  );

  routes.post('/session/revoke', async (context) =>
    context.json(
      await authService.revokeSession(
        getBearerToken(context),
        getRequestMetadata(context),
      ),
      201,
    ),
  );

  return routes;
}
