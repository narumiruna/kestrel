import { serve } from '@hono/node-server';
import { createApp } from './app';
import { createContainer } from './container';
import { Logger } from './logger';

const DEFAULT_PORT = 3300;

const port = parsePort(process.env.PORT);

serve({ fetch: createApp(createContainer()).fetch, port }, () => {
  Logger.log(`kestrel-cloud-api listening on ${port}`, 'Bootstrap');
});

function parsePort(value: string | undefined): number {
  if (value == null) {
    return DEFAULT_PORT;
  }

  const port = Number(value);

  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(
      `PORT must be an integer between 0 and 65535, got ${value}`,
    );
  }

  return port;
}
