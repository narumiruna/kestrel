import { Hono } from 'hono';
import {
  type AuthVariables,
  getAuthenticatedUserId,
} from '../auth/auth-request';
import type { SessionAuth } from '../auth/session-auth.middleware';
import { BadRequestException } from '../http/errors';
import { readJsonBody } from '../http/handlers';
import { LibraryService } from './library.service';

export function createLibraryRoutes(
  libraryService: LibraryService,
  sessionAuth: SessionAuth,
): Hono<{ Variables: AuthVariables }> {
  const routes = new Hono<{ Variables: AuthVariables }>();

  routes.get('/places', sessionAuth, async (context) =>
    context.json(
      await libraryService.listPlaces(
        getAuthenticatedUserId(context),
        parseIncludeDeletedQuery(context.req.query('includeDeleted')),
      ),
    ),
  );

  routes.get('/places/:placeId', sessionAuth, async (context) =>
    context.json(
      await libraryService.getPlace(
        getAuthenticatedUserId(context),
        context.req.param('placeId'),
        parseIncludeDeletedQuery(context.req.query('includeDeleted')),
      ),
    ),
  );

  routes.post('/places', sessionAuth, async (context) =>
    context.json(
      await libraryService.createPlace(
        getAuthenticatedUserId(context),
        await readJsonBody(context),
      ),
      201,
    ),
  );

  routes.patch('/places/:placeId', sessionAuth, async (context) =>
    context.json(
      await libraryService.updatePlace(
        getAuthenticatedUserId(context),
        context.req.param('placeId'),
        await readJsonBody(context),
      ),
    ),
  );

  routes.delete('/places/:placeId', sessionAuth, async (context) =>
    context.json(
      await libraryService.deletePlace(
        getAuthenticatedUserId(context),
        context.req.param('placeId'),
      ),
    ),
  );

  routes.get('/routes', sessionAuth, async (context) =>
    context.json(
      await libraryService.listRoutes(
        getAuthenticatedUserId(context),
        parseIncludeDeletedQuery(context.req.query('includeDeleted')),
      ),
    ),
  );

  routes.get('/routes/:routeId', sessionAuth, async (context) =>
    context.json(
      await libraryService.getRoute(
        getAuthenticatedUserId(context),
        context.req.param('routeId'),
        parseIncludeDeletedQuery(context.req.query('includeDeleted')),
      ),
    ),
  );

  routes.post('/routes', sessionAuth, async (context) =>
    context.json(
      await libraryService.createRoute(
        getAuthenticatedUserId(context),
        await readJsonBody(context),
      ),
      201,
    ),
  );

  routes.patch('/routes/:routeId', sessionAuth, async (context) =>
    context.json(
      await libraryService.updateRoute(
        getAuthenticatedUserId(context),
        context.req.param('routeId'),
        await readJsonBody(context),
      ),
    ),
  );

  routes.delete('/routes/:routeId', sessionAuth, async (context) =>
    context.json(
      await libraryService.deleteRoute(
        getAuthenticatedUserId(context),
        context.req.param('routeId'),
      ),
    ),
  );

  routes.post('/library-items/reorder', sessionAuth, async (context) =>
    context.json(
      await libraryService.reorderLibraryItem(
        getAuthenticatedUserId(context),
        await readJsonBody(context),
      ),
      201,
    ),
  );

  routes.post(
    '/library-items/:libraryItemId/touch',
    sessionAuth,
    async (context) =>
      context.json(
        await libraryService.touchLibraryItem(
          getAuthenticatedUserId(context),
          context.req.param('libraryItemId'),
        ),
        201,
      ),
  );

  return routes;
}

function parseIncludeDeletedQuery(includeDeleted: string | undefined): boolean {
  if (includeDeleted == null) {
    return false;
  }

  if (includeDeleted === 'true') {
    return true;
  }

  if (includeDeleted === 'false') {
    return false;
  }

  throw new BadRequestException('includeDeleted must be true or false');
}
