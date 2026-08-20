import { type ServerType, serve } from '@hono/node-server';
import { createApp } from './app';
import { type Container, createContainer } from './container';
import { createLogger } from './logger';

const DEFAULT_PORT = 3300;
const SHUTDOWN_TIMEOUT_MS = 5000;

const logger = createLogger('Bootstrap');

let container: Container | undefined;
let server: ServerType | undefined;
let shuttingDown = false;

// Registered before bootstrapping so startup failures are logged too.
process.on('uncaughtException', (error) => {
  logger.fatal({ err: error }, 'uncaught exception');
  shutdown(1);
});
process.on('unhandledRejection', (reason) => {
  logger.fatal({ err: reason }, 'unhandled promise rejection');
  shutdown(1);
});
process.on('SIGTERM', () => {
  logger.info({ signal: 'SIGTERM' }, 'shutting down');
  shutdown(0);
});
process.on('SIGINT', () => {
  logger.info({ signal: 'SIGINT' }, 'shutting down');
  shutdown(0);
});

try {
  container = createContainer();

  const port = parsePort(process.env.PORT);

  server = serve({ fetch: createApp(container).fetch, port }, (info) => {
    logger.info(
      {
        nodeEnv: process.env.NODE_ENV ?? 'development',
        port: info.port,
      },
      'kestrel-cloud-api listening',
    );
  });
} catch (error) {
  logger.fatal({ err: error }, 'failed to start kestrel-cloud-api');
  shutdown(1);
}

function shutdown(exitCode: number): void {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  // Never hang on a stuck connection or database handle.
  setTimeout(() => {
    process.exit(exitCode);
  }, SHUTDOWN_TIMEOUT_MS).unref();

  void closeServer()
    .then(async () => container?.prismaService.$disconnect())
    .catch((error: unknown) => {
      logger.warn({ err: error }, 'failed to shut down cleanly');
    })
    .finally(() => {
      process.exit(exitCode);
    });
}

async function closeServer(): Promise<void> {
  const runningServer = server;

  if (runningServer == null) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    runningServer.close((error) => {
      if (error == null) {
        resolve();
      } else {
        reject(error);
      }
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
