import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaService } from './prisma/prisma.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('test'),
          },
        },
        {
          provide: PrismaService,
          useValue: {
            $queryRaw: jest.fn().mockResolvedValue([{ ready: 1 }]),
          },
        },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return backend service metadata', () => {
      expect(appController.getServiceInfo()).toEqual({
        environment: 'test',
        phase: 'bootstrap',
        service: 'kestrel-cloud-api',
      });
    });
  });

  describe('health', () => {
    it('should report readiness after the database responds', async () => {
      await expect(appController.getHealth()).resolves.toEqual({
        service: 'kestrel-cloud-api',
        status: 'ok',
      });
    });
  });
});
