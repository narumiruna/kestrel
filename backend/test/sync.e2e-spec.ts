import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { SyncEntityType, SyncOperation, type Prisma } from '@prisma/client';
import request from 'supertest';
import { type App } from 'supertest/types';
import { AccessTokenService } from './../src/auth/access-token.service';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';

type MockLibraryItemRecord = ReturnType<typeof createLibraryItemRecord>;
type MockPlaceRecord = ReturnType<typeof createPlaceRecord>;
type MockRouteRecord = ReturnType<typeof createRouteRecord>;
type MockSessionRecord = {
  expiresAt: Date;
  id: string;
  revokedAt: Date | null;
  userId: string;
};
type MockSyncEventRecord = {
  entityId: string;
  entityType: SyncEntityType;
  id: bigint;
  operation: SyncOperation;
  payload: Prisma.JsonValue | null;
  userId: string;
};

type MockPrismaService = {
  libraryItem: {
    findMany: jest.Mock<Promise<MockLibraryItemRecord[]>, [unknown]>;
  };
  place: {
    findMany: jest.Mock<Promise<MockPlaceRecord[]>, [unknown]>;
  };
  route: {
    findMany: jest.Mock<Promise<MockRouteRecord[]>, [unknown]>;
  };
  session: {
    findUnique: jest.Mock<Promise<MockSessionRecord | null>, [unknown]>;
  };
  syncEvent: {
    findFirst: jest.Mock<Promise<{ id: bigint } | null>, [unknown]>;
    findMany: jest.Mock<Promise<MockSyncEventRecord[]>, [unknown]>;
  };
};

describe('SyncController (e2e)', () => {
  let accessToken: string;
  let app: INestApplication<App>;
  let libraryItems: MockLibraryItemRecord[];
  let places: MockPlaceRecord[];
  let prismaService: MockPrismaService;
  let routes: MockRouteRecord[];
  let sessions: MockSessionRecord[];
  let syncEvents: MockSyncEventRecord[];

  beforeEach(async () => {
    process.env.AUTH_ACCESS_TOKEN_SECRET = 'kestrel-test-access-token-secret';
    process.env.AUTH_ACCESS_TOKEN_TTL_SECONDS = '900';
    libraryItems = [
      createLibraryItemRecord({
        id: 'library-item-1',
        kind: 'PLACE',
        placeId: 'place-1',
        routeId: null,
        sortOrder: 0,
      }),
      createLibraryItemRecord({
        id: 'library-item-2',
        kind: 'ROUTE',
        placeId: null,
        routeId: 'route-1',
        sortOrder: 1,
      }),
    ];
    places = [
      createPlaceRecord({
        deletedAt: null,
        id: 'place-1',
        libraryItem: libraryItems[0],
      }),
    ];
    routes = [
      createRouteRecord({
        deletedAt: null,
        id: 'route-1',
        libraryItem: libraryItems[1],
        revisionId: 'revision-1',
      }),
    ];
    sessions = [
      {
        expiresAt: new Date('2026-05-10T00:00:00.000Z'),
        id: 'session-1',
        revokedAt: null,
        userId: 'user-1',
      },
    ];
    syncEvents = [
      createSyncEventRecord({
        entityId: 'place-1',
        entityType: SyncEntityType.PLACE,
        id: 1n,
        operation: SyncOperation.UPSERT,
      }),
      createSyncEventRecord({
        entityId: 'library-item-1',
        entityType: SyncEntityType.LIBRARY_ITEM,
        id: 2n,
        operation: SyncOperation.UPSERT,
      }),
      createSyncEventRecord({
        entityId: 'route-1',
        entityType: SyncEntityType.ROUTE,
        id: 3n,
        operation: SyncOperation.UPSERT,
      }),
      createSyncEventRecord({
        entityId: 'library-item-2',
        entityType: SyncEntityType.LIBRARY_ITEM,
        id: 4n,
        operation: SyncOperation.UPSERT,
      }),
      createSyncEventRecord({
        entityId: 'route-2',
        entityType: SyncEntityType.ROUTE,
        id: 5n,
        operation: SyncOperation.DELETE,
        payload: {
          deletedAt: '2026-05-09T18:30:00.000Z',
        },
      }),
    ];
    prismaService = {
      libraryItem: {
        findMany: jest.fn((args: Prisma.LibraryItemFindManyArgs) =>
          Promise.resolve(filterLibraryItems(libraryItems, args)),
        ),
      },
      place: {
        findMany: jest.fn((args: Prisma.PlaceFindManyArgs) =>
          Promise.resolve(filterPlaces(places, args)),
        ),
      },
      route: {
        findMany: jest.fn((args: Prisma.RouteFindManyArgs) =>
          Promise.resolve(filterRoutes(routes, args)),
        ),
      },
      session: {
        findUnique: jest.fn((args: Prisma.SessionFindUniqueArgs) =>
          Promise.resolve(
            sessions.find((session) => session.id === args.where.id) ?? null,
          ),
        ),
      },
      syncEvent: {
        findFirst: jest.fn((args: Prisma.SyncEventFindFirstArgs) =>
          Promise.resolve(findBoundarySyncEvent(syncEvents, args.orderBy)),
        ),
        findMany: jest.fn((args: Prisma.SyncEventFindManyArgs) =>
          Promise.resolve(
            syncEvents.filter(
              (event) =>
                event.userId === args.where?.userId &&
                event.id > (args.where?.id?.gt ?? 0n),
            ),
          ),
        ),
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

    accessToken = app.get(AccessTokenService).issueToken({
      sessionId: 'session-1',
      userId: 'user-1',
    }).token;
  });

  afterEach(async () => {
    await app.close();
  });

  it('/sync/bootstrap (GET)', async () => {
    await request(app.getHttpServer())
      .get('/sync/bootstrap')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({
          libraryItems: [
            {
              id: 'library-item-1',
            },
            {
              id: 'library-item-2',
            },
          ],
          places: [
            {
              id: 'place-1',
            },
          ],
          routes: [
            {
              currentRevision: {
                id: 'revision-1',
              },
              id: 'route-1',
            },
          ],
          syncCursor: '5',
        });
      });
  });

  it('/sync/changes (GET)', async () => {
    await request(app.getHttpServer())
      .get('/sync/changes')
      .query({
        since: '2',
      })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({
          deletions: [
            {
              deletedAt: '2026-05-09T18:30:00.000Z',
              entityId: 'route-2',
              entityType: 'ROUTE',
            },
          ],
          libraryItems: [
            {
              id: 'library-item-2',
            },
          ],
          nextCursor: '5',
          places: [],
          routes: [
            {
              id: 'route-1',
            },
          ],
        });
      });
  });
});

function createLibraryItemRecord(input: {
  id: string;
  kind: 'PLACE' | 'ROUTE';
  placeId: string | null;
  routeId: string | null;
  sortOrder: number;
}) {
  return {
    createdAt: new Date('2026-05-09T17:00:00.000Z'),
    deletedAt: null,
    id: input.id,
    kind: input.kind,
    lastUsedAt: null,
    pinned: false,
    placeId: input.placeId,
    routeId: input.routeId,
    sortOrder: input.sortOrder,
    updatedAt: new Date('2026-05-09T17:00:00.000Z'),
  };
}

function createPlaceRecord(input: {
  deletedAt: Date | null;
  id: string;
  libraryItem: MockLibraryItemRecord | null;
}) {
  return {
    createdAt: new Date('2026-05-09T17:00:00.000Z'),
    deletedAt: input.deletedAt,
    description: 'Test place',
    id: input.id,
    latitude: 25.03,
    libraryItem: input.libraryItem,
    longitude: 121.56,
    name: 'Taipei',
    tags: ['city'],
    updatedAt: new Date('2026-05-09T17:00:00.000Z'),
  };
}

function createRouteRecord(input: {
  deletedAt: Date | null;
  id: string;
  libraryItem: MockLibraryItemRecord | null;
  revisionId: string;
}) {
  return {
    createdAt: new Date('2026-05-09T17:00:00.000Z'),
    currentRevision: {
      createdAt: new Date('2026-05-09T17:00:00.000Z'),
      createdBy: 'user-1',
      id: input.revisionId,
      payload: {
        defaultSpeedKmh: 20,
        mode: 'LOOP',
        waypoints: [
          {
            latitude: 25.03,
            longitude: 121.56,
            pauseSeconds: null,
            sequence: 0,
            speedKmh: null,
          },
          {
            latitude: 25.04,
            longitude: 121.57,
            pauseSeconds: null,
            sequence: 1,
            speedKmh: null,
          },
        ],
      },
      revisionNumber: 1,
    },
    defaultSpeedKmh: 20,
    deletedAt: input.deletedAt,
    description: 'Morning commute',
    id: input.id,
    isPublic: true,
    libraryItem: input.libraryItem,
    mode: 'LOOP',
    name: 'River ride',
    updatedAt: new Date('2026-05-09T17:00:00.000Z'),
  };
}

function createSyncEventRecord(input: {
  entityId: string;
  entityType: SyncEntityType;
  id: bigint;
  operation: SyncOperation;
  payload?: Prisma.JsonValue | null;
}) {
  return {
    entityId: input.entityId,
    entityType: input.entityType,
    id: input.id,
    operation: input.operation,
    payload: input.payload ?? null,
    userId: 'user-1',
  };
}

function filterLibraryItems(
  libraryItems: MockLibraryItemRecord[],
  args: Prisma.LibraryItemFindManyArgs,
) {
  return libraryItems.filter((libraryItem) => {
    if (args.where?.userId != null && args.where.userId !== 'user-1') {
      return false;
    }

    if (args.where?.deletedAt === null && libraryItem.deletedAt != null) {
      return false;
    }

    if (!matchesIdFilter(args.where?.id, libraryItem.id)) {
      return false;
    }

    return true;
  });
}

function filterPlaces(
  places: MockPlaceRecord[],
  args: Prisma.PlaceFindManyArgs,
) {
  return places.filter((place) => {
    if (args.where?.userId != null && args.where.userId !== 'user-1') {
      return false;
    }

    if (args.where?.deletedAt === null && place.deletedAt != null) {
      return false;
    }

    if (!matchesIdFilter(args.where?.id, place.id)) {
      return false;
    }

    return true;
  });
}

function filterRoutes(
  routes: MockRouteRecord[],
  args: Prisma.RouteFindManyArgs,
) {
  return routes.filter((route) => {
    if (args.where?.userId != null && args.where.userId !== 'user-1') {
      return false;
    }

    if (args.where?.deletedAt === null && route.deletedAt != null) {
      return false;
    }

    if (!matchesIdFilter(args.where?.id, route.id)) {
      return false;
    }

    return true;
  });
}

function findBoundarySyncEvent(
  syncEvents: MockSyncEventRecord[],
  orderBy:
    | Prisma.SyncEventOrderByWithRelationInput
    | Prisma.SyncEventOrderByWithRelationInput[]
    | undefined,
) {
  if (orderBy == null) {
    return null;
  }

  const firstOrderBy = Array.isArray(orderBy) ? orderBy[0] : orderBy;

  if (firstOrderBy?.id === 'desc') {
    return syncEvents.length === 0
      ? null
      : { id: syncEvents[syncEvents.length - 1].id };
  }

  return syncEvents.length === 0 ? null : { id: syncEvents[0].id };
}

function matchesIdFilter(filter: unknown, id: string) {
  if (filter == null) {
    return true;
  }

  if (typeof filter !== 'object' || Array.isArray(filter)) {
    return true;
  }

  const values = (filter as { in?: unknown }).in;

  if (!Array.isArray(values)) {
    return true;
  }

  return values.includes(id);
}
