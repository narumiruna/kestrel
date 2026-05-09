import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { argon2id, hash } from 'argon2';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { TotpService } from './../src/auth/totp.service';
import { PrismaService } from './../src/prisma/prisma.service';

type AuthUserRecord = {
  createdAt: Date;
  id: string;
  passwordHash?: string;
  totpEnabledAt?: Date | null;
  totpSecretEncrypted?: string | null;
  username: string;
};

type MockPrismaService = {
  user: {
    create: jest.Mock<
      Promise<Record<string, unknown>>,
      [Prisma.UserCreateArgs]
    >;
    findUnique: jest.Mock<
      Promise<Record<string, unknown> | null>,
      [Prisma.UserFindUniqueArgs]
    >;
    update: jest.Mock<
      Promise<Record<string, unknown>>,
      [Prisma.UserUpdateArgs]
    >;
  };
};

type TotpSetupResponse = {
  otpauthUrl: string;
  qrCodeDataUrl: string;
  secret: string;
  user: {
    id: string;
    username: string;
  };
};

type TotpVerifyResponse = {
  nextStep: string;
  user: {
    id: string;
    totpEnabledAt: string;
    username: string;
  };
};

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;
  let prismaService: MockPrismaService;
  let storedUsersById: Map<string, AuthUserRecord>;
  let storedUsers: Map<string, AuthUserRecord>;

  beforeEach(async () => {
    process.env.AUTH_TOTP_ENCRYPTION_KEY =
      'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=';
    process.env.AUTH_TOTP_ISSUER = 'Kestrel Test';
    storedUsersById = new Map();
    storedUsers = new Map();
    prismaService = {
      user: {
        create: jest.fn((args: Prisma.UserCreateArgs) => {
          const createdUser: AuthUserRecord = {
            createdAt: new Date('2026-05-09T00:00:00.000Z'),
            id: 'user-1',
            passwordHash: String(args.data.passwordHash),
            totpEnabledAt: null,
            totpSecretEncrypted: null,
            username: String(args.data.username),
          };
          storedUsersById.set(createdUser.id, createdUser);
          storedUsers.set(createdUser.username, createdUser);

          return Promise.resolve(applySelect(createdUser, args.select));
        }),
        findUnique: jest.fn((args: Prisma.UserFindUniqueArgs) => {
          const username = args.where.username;

          if (typeof username !== 'string') {
            return Promise.resolve(null);
          }

          const user = storedUsers.get(username);

          return Promise.resolve(
            user == null ? null : applySelect(user, args.select),
          );
        }),
        update: jest.fn((args: Prisma.UserUpdateArgs) => {
          const user = storedUsersById.get(String(args.where.id));

          if (user == null) {
            throw new Error('user not found');
          }

          const updatedUser = {
            ...user,
            ...args.data,
          };
          storedUsersById.set(updatedUser.id, updatedUser);
          storedUsers.set(updatedUser.username, updatedUser);

          return Promise.resolve(applySelect(updatedUser, args.select));
        }),
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

  it('/auth/totp/setup + /auth/totp/verify (POST)', async () => {
    const password = 'a-very-secure-password';
    const passwordHash = await hash(password, { type: argon2id });

    storedUsers.set('alice', {
      createdAt: new Date('2026-05-09T00:00:00.000Z'),
      id: 'user-1',
      passwordHash,
      totpEnabledAt: null,
      totpSecretEncrypted: null,
      username: 'alice',
    });
    storedUsersById.set('user-1', storedUsers.get('alice') as AuthUserRecord);

    const setupResponse = await request(app.getHttpServer())
      .post('/auth/totp/setup')
      .send({
        password,
        username: 'alice',
      })
      .expect(201);
    const setupBody = setupResponse.body as TotpSetupResponse;

    expect(setupBody.user).toEqual({
      id: 'user-1',
      username: 'alice',
    });
    expect(setupBody.secret).toMatch(/^[A-Z2-7]+$/);
    expect(setupBody.otpauthUrl).toContain('otpauth://totp/');
    expect(setupBody.qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);

    const persistedUser = storedUsers.get('alice');
    const totpService = app.get(TotpService);
    const totpCode = totpService.generateCode(
      totpService.decryptSecret(persistedUser?.totpSecretEncrypted ?? ''),
      new Date('2026-05-09T15:33:00.000Z'),
    );
    jest.useFakeTimers().setSystemTime(new Date('2026-05-09T15:33:00.000Z'));

    await request(app.getHttpServer())
      .post('/auth/totp/verify')
      .send({
        code: totpCode,
        password,
        username: 'alice',
      })
      .expect(201)
      .expect((response) => {
        const responseBody = response.body as TotpVerifyResponse;

        expect(responseBody.nextStep).toBe('login');
        expect(responseBody.user.id).toBe('user-1');
        expect(responseBody.user.username).toBe('alice');
        expect(responseBody.user.totpEnabledAt).toBe(
          '2026-05-09T15:33:00.000Z',
        );
      });
  });

  afterEach(async () => {
    jest.useRealTimers();
    await app.close();
    delete process.env.AUTH_TOTP_ENCRYPTION_KEY;
    delete process.env.AUTH_TOTP_ISSUER;
  });
});

function applySelect(
  record: AuthUserRecord,
  select: Prisma.UserSelect | null | undefined,
): Record<string, unknown> {
  if (select == null) {
    return { ...record };
  }

  return Object.fromEntries(
    Object.entries(select)
      .filter(([, value]) => value === true)
      .map(([key]) => [key, record[key as keyof AuthUserRecord] ?? null]),
  );
}
