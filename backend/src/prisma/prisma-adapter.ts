import { PrismaPg } from '@prisma/adapter-pg';
import 'dotenv/config';

export function createPrismaAdapter() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error('DATABASE_URL is required');
  }

  return new PrismaPg({ connectionString });
}
