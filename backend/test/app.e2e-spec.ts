import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';

type AuthUserRecord = {
  createdAt: Date;
  id: string;
  username: string;
};

type MockPrismaService = {
  user: {
    create: jest.Mock<Promise<AuthUserRecord>, [Prisma.UserCreateArgs]>;
    findUnique: jest.Mock<
      Promise<{ id: string } | null>,
      [Prisma.UserFindUniqueArgs]
    >;
  };
};

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;
  let prismaService: MockPrismaService;

  beforeEach(async () => {
    prismaService = {
      user: {
        create: jest.fn<Promise<AuthUserRecord>, [Prisma.UserCreateArgs]>(),
        findUnique: jest.fn<
          Promise<{ id: string } | null>,
          [Prisma.UserFindUniqueArgs]
        >(),
      },
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaService)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer()).get('/').expect(200).expect({
      environment: 'test',
      phase: 'bootstrap',
      service: 'kestrel-cloud-api',
    });
  });

  it('/auth/register (POST)', async () => {
    const createdAt = new Date('2026-05-09T00:00:00.000Z');

    prismaService.user.findUnique.mockResolvedValue(null);
    prismaService.user.create.mockImplementation((args) =>
      Promise.resolve({
        createdAt,
        id: 'user-1',
        username: args.data.username,
      }),
    );

    await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        password: 'a-very-secure-password',
        username: 'alice',
      })
      .expect(201)
      .expect({
        nextStep: 'totp_setup',
        user: {
          createdAt: createdAt.toISOString(),
          id: 'user-1',
          username: 'alice',
        },
      });
  });

  afterEach(async () => {
    await app.close();
  });
});
