import { serve } from '@hono/node-server';
import { createApp } from './app';
import { createContainer } from './container';
import { createLogger } from './logger';

const DEFAULT_PORT = 3300;

const logger = createLogger('Bootstrap');
const container = createContainer();
const port = parsePort(process.env.PORT);

const server = serve({ fetch: createApp(container).fetch, port }, (info) => {
  logger.info(
    {
      nodeEnv: process.env.NODE_ENV ?? 'development',
      port: info.port,
    },
    'kestrel-cloud-api listening',
  );
});

process.on('SIGTERM', () => {
  shutdown('SIGTERM');
});
process.on('SIGINT', () => {
  shutdown('SIGINT');
});
process.on('uncaughtException', (error) => {
  logger.fatal({ err: error }, 'uncaught exception');
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  logger.fatal({ err: reason }, 'unhandled promise rejection');
  process.exit(1);
});

function shutdown(signal: NodeJS.Signals): void {
  logger.info({ signal }, 'shutting down');

  server.close(() => {
    void container.prismaService
      .$disconnect()
      .catch((error: unknown) => {
        logger.warn({ err: error }, 'failed to disconnect from the database');
      })
      .finally(() => {
        process.exit(0);
      });
  });
}

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
