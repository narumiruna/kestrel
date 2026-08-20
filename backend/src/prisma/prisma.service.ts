import { PrismaClient, type Prisma } from '@prisma/client';
import { createLogger } from '../logger';

const PRISMA_OPTIONS = {
  log: [
    { emit: 'event', level: 'warn' },
    { emit: 'event', level: 'error' },
  ],
} satisfies Prisma.PrismaClientOptions;

const logger = createLogger('Prisma');

export class PrismaService extends PrismaClient<typeof PRISMA_OPTIONS> {
  constructor() {
    super(PRISMA_OPTIONS);

    this.$on('warn', (event) => {
      logger.warn({ target: event.target }, event.message);
    });
    this.$on('error', (event) => {
      logger.error({ target: event.target }, event.message);
    });
  }
}
