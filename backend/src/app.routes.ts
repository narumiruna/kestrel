import { Hono } from 'hono';
import type { AuthVariables } from './auth/auth-request';
import { AppService } from './app.service';

export function createAppRoutes(
  appService: AppService,
): Hono<{ Variables: AuthVariables }> {
  const routes = new Hono<{ Variables: AuthVariables }>();

  routes.get('/', (context) => context.json(appService.getServiceInfo()));

  routes.get('/health', async (context) =>
    context.json(await appService.getHealth()),
  );

  return routes;
}
