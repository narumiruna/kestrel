import { AppService } from './app.service';
import { createAppRoutes } from './app.routes';
import type { PrismaService } from './prisma/prisma.service';

describe('app routes', () => {
  const routes = createAppRoutes(
    new AppService({ get: jest.fn().mockReturnValue('test') }, {
      $queryRaw: jest.fn().mockResolvedValue([{ ready: 1 }]),
    } as unknown as PrismaService),
  );

  it('returns backend service metadata', async () => {
    const response = await routes.request('/');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      environment: 'test',
      phase: 'bootstrap',
      service: 'kestrel-cloud-api',
    });
  });

  it('reports readiness after the database responds', async () => {
    const response = await routes.request('/health');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      service: 'kestrel-cloud-api',
      status: 'ok',
    });
  });
});
