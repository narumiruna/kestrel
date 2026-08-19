import { Hono } from 'hono';
import {
  type AuthVariables,
  getAuthenticatedUserId,
} from '../auth/auth-request';
import type { SessionAuth } from '../auth/session-auth.middleware';
import { readJsonBody } from '../http/handlers';
import { SharingService } from './sharing.service';

export function createSharingRoutes(
  sharingService: SharingService,
  sessionAuth: SessionAuth,
): Hono<{ Variables: AuthVariables }> {
  const routes = new Hono<{ Variables: AuthVariables }>();

  routes.get('/places/:placeId/share-link', sessionAuth, async (context) =>
    context.json(
      await sharingService.getPlaceShareLink(
        getAuthenticatedUserId(context),
        context.req.param('placeId'),
      ),
    ),
  );

  routes.post('/places/:placeId/share-link', sessionAuth, async (context) =>
    context.json(
      await sharingService.createPlaceShareLink(
        getAuthenticatedUserId(context),
        context.req.param('placeId'),
      ),
      201,
    ),
  );

  routes.patch('/places/:placeId/share-link', sessionAuth, async (context) =>
    context.json(
      await sharingService.updatePlaceShareLink(
        getAuthenticatedUserId(context),
        context.req.param('placeId'),
        await readJsonBody(context),
      ),
    ),
  );

  routes.get('/routes/:routeId/share-link', sessionAuth, async (context) =>
    context.json(
      await sharingService.getRouteShareLink(
        getAuthenticatedUserId(context),
        context.req.param('routeId'),
      ),
    ),
  );

  routes.post('/routes/:routeId/share-link', sessionAuth, async (context) =>
    context.json(
      await sharingService.createRouteShareLink(
        getAuthenticatedUserId(context),
        context.req.param('routeId'),
      ),
      201,
    ),
  );

  routes.patch('/routes/:routeId/share-link', sessionAuth, async (context) =>
    context.json(
      await sharingService.updateRouteShareLink(
        getAuthenticatedUserId(context),
        context.req.param('routeId'),
        await readJsonBody(context),
      ),
    ),
  );

  routes.get('/shares/:token', async (context) =>
    context.json(
      await sharingService.getSharedItem(context.req.param('token')),
    ),
  );

  routes.post('/shares/:token/copy', sessionAuth, async (context) =>
    context.json(
      await sharingService.copySharedItem(
        getAuthenticatedUserId(context),
        context.req.param('token'),
        await readJsonBody(context),
      ),
      201,
    ),
  );

  return routes;
}
