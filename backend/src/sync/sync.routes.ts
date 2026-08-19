import { Hono } from 'hono';
import {
  type AuthVariables,
  getAuthenticatedUserId,
} from '../auth/auth-request';
import type { SessionAuth } from '../auth/session-auth.middleware';
import { readJsonBody } from '../http/handlers';
import { SyncService } from './sync.service';
import { parseSinceCursorQuery } from './sync.validation';

export function createSyncRoutes(
  syncService: SyncService,
  sessionAuth: SessionAuth,
): Hono<{ Variables: AuthVariables }> {
  const routes = new Hono<{ Variables: AuthVariables }>();

  routes.use('*', sessionAuth);

  routes.get('/bootstrap', async (context) =>
    context.json(await syncService.bootstrap(getAuthenticatedUserId(context))),
  );

  routes.post('/upload', async (context) =>
    context.json(
      await syncService.upload(
        getAuthenticatedUserId(context),
        await readJsonBody(context),
      ),
      201,
    ),
  );

  routes.get('/changes', async (context) =>
    context.json(
      await syncService.getChanges(
        getAuthenticatedUserId(context),
        parseSinceCursorQuery(context.req.query('since')),
      ),
    ),
  );

  return routes;
}
