import { PrismaClient, type Prisma } from '@prisma/client';
import { createLogger } from '../logger';
import { createPrismaAdapter } from './prisma-adapter';

function createPrismaOptions() {
  return {
    adapter: createPrismaAdapter(),
    log: [
      { emit: 'event', level: 'warn' },
      { emit: 'event', level: 'error' },
    ],
  } satisfies Prisma.PrismaClientOptions;
}

type PrismaOptions = ReturnType<typeof createPrismaOptions>;

const logger = createLogger('Prisma');

export class PrismaService extends PrismaClient<PrismaOptions> {
  constructor() {
    super(createPrismaOptions());

    this.$on('warn', (event) => {
      logger.warn({ target: event.target }, event.message);
    });
    this.$on('error', (event) => {
      logger.error({ target: event.target }, event.message);
    });
  }
}
