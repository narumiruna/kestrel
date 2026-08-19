import { Hono } from 'hono';
import {
  type AuthVariables,
  getAuthenticatedSessionId,
  getAuthenticatedUserId,
} from '../auth/auth-request';
import type { SessionAuth } from '../auth/session-auth.middleware';
import { readJsonBody } from '../http/handlers';
import { RemoteControlService } from './remote-control.service';

export function createRemoteControlRoutes(
  remoteControlService: RemoteControlService,
  sessionAuth: SessionAuth,
): Hono<{ Variables: AuthVariables }> {
  const routes = new Hono<{ Variables: AuthVariables }>();

  routes.post('/devices/register', sessionAuth, async (context) =>
    context.json(
      await remoteControlService.registerDevice(
        getAuthenticatedUserId(context),
        getAuthenticatedSessionId(context),
        await readJsonBody(context),
      ),
      201,
    ),
  );

  routes.get('/devices', sessionAuth, async (context) =>
    context.json(
      await remoteControlService.listDevices(getAuthenticatedUserId(context)),
    ),
  );

  routes.post('/devices/:deviceId/commands', sessionAuth, async (context) =>
    context.json(
      await remoteControlService.createCommand(
        getAuthenticatedUserId(context),
        context.req.param('deviceId'),
        await readJsonBody(context),
      ),
      201,
    ),
  );

  routes.post(
    '/devices/:deviceId/commands/poll',
    sessionAuth,
    async (context) =>
      context.json(
        await remoteControlService.pollCommands(
          getAuthenticatedUserId(context),
          context.req.param('deviceId'),
          await readJsonBody(context),
        ),
        201,
      ),
  );

  routes.post('/devices/:deviceId/state', sessionAuth, async (context) =>
    context.json(
      await remoteControlService.reportDeviceState(
        getAuthenticatedUserId(context),
        context.req.param('deviceId'),
        await readJsonBody(context),
      ),
      201,
    ),
  );

  routes.post(
    '/devices/:deviceId/commands/:commandId/ack',
    sessionAuth,
    async (context) =>
      context.json(
        await remoteControlService.ackCommand(
          getAuthenticatedUserId(context),
          context.req.param('deviceId'),
          context.req.param('commandId'),
          await readJsonBody(context),
        ),
        201,
      ),
  );

  return routes;
}
