import { Hono } from 'hono';
import { createAccountSecurityRoutes } from './account-security/account-security.routes';
import { createAppRoutes } from './app.routes';
import type { AuthVariables } from './auth/auth-request';
import { createAuthRoutes } from './auth/auth.routes';
import type { Container } from './container';
import { enforceBodyLimit, handleError, handleNotFound } from './http/handlers';
import { createHttpRequestLogging } from './http-request-logging.middleware';
import { createLibraryRoutes } from './library/library.routes';
import { createRemoteControlRoutes } from './remote-control/remote-control.routes';
import { createSharingRoutes } from './sharing/sharing.routes';
import { createSyncRoutes } from './sync/sync.routes';

export function createApp(container: Container): Hono<{
  Variables: AuthVariables;
}> {
  const app = new Hono<{ Variables: AuthVariables }>();

  app.use('*', createHttpRequestLogging());
  app.use('*', enforceBodyLimit);

  app.route('/', createAppRoutes(container.appService));
  app.route(
    '/auth',
    createAuthRoutes(container.authService, container.sessionAuth),
  );
  app.route(
    '/',
    createAccountSecurityRoutes(
      container.accountSecurityService,
      container.sessionAuth,
    ),
  );
  app.route(
    '/',
    createLibraryRoutes(container.libraryService, container.sessionAuth),
  );
  app.route(
    '/sync',
    createSyncRoutes(container.syncService, container.sessionAuth),
  );
  app.route(
    '/',
    createSharingRoutes(container.sharingService, container.sessionAuth),
  );
  app.route(
    '/',
    createRemoteControlRoutes(
      container.remoteControlService,
      container.sessionAuth,
    ),
  );

  app.notFound(handleNotFound);
  app.onError(handleError);

  return app;
}
