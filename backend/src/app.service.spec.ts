import { ServiceUnavailableException } from './http/errors';
import { ConfigService } from './config.service';
import { AppService } from './app.service';
import type { PrismaService } from './prisma/prisma.service';

describe('AppService', () => {
  const configService = {
    get: jest.fn().mockReturnValue('test'),
  } as unknown as ConfigService;

  it('reports healthy only after the database responds', async () => {
    const prismaService = {
      $queryRaw: jest.fn().mockResolvedValue([{ ready: 1 }]),
    } as unknown as PrismaService;
    const service = new AppService(configService, prismaService);

    await expect(service.getHealth()).resolves.toEqual({
      service: 'kestrel-cloud-api',
      status: 'ok',
    });
  });

  it('returns a service-unavailable error when the database is unavailable', async () => {
    const prismaService = {
      $queryRaw: jest.fn().mockRejectedValue(new Error('connection secret')),
    } as unknown as PrismaService;
    const service = new AppService(configService, prismaService);

    await expect(service.getHealth()).rejects.toEqual(
      new ServiceUnavailableException('database is not ready'),
    );
  });
});
