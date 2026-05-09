import { BadRequestException, GoneException } from '@nestjs/common';
import {
  LibraryItemKind,
  RouteMode,
  SyncEntityType,
  SyncOperation,
  type Prisma,
} from '@prisma/client';
import { SyncService } from './sync.service';

type MockLibraryItemRecord = ReturnType<typeof createLibraryItemRecord>;
type MockPlaceRecord = ReturnType<typeof createPlaceRecord>;
type MockRouteRecord = ReturnType<typeof createRouteRecord>;
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
  syncEvent: {
    findFirst: jest.Mock<Promise<{ id: bigint } | null>, [unknown]>;
    findMany: jest.Mock<Promise<MockSyncEventRecord[]>, [unknown]>;
  };
};

describe('SyncService', () => {
  let prismaService: MockPrismaService;
  let syncService: SyncService;

  beforeEach(() => {
    prismaService = createMockPrismaService();
    syncService = new SyncService(prismaService as never);
  });

  it('returns active library state and latest cursor during bootstrap', async () => {
    prismaService.place.findMany.mockResolvedValue([
      createPlaceRecord({
        id: 'place-1',
        libraryItemId: 'library-item-1',
        sortOrder: 0,
      }),
    ]);
    prismaService.route.findMany.mockResolvedValue([
      createRouteRecord({
        defaultSpeedKmh: 20,
        id: 'route-1',
        libraryItemId: 'library-item-2',
        mode: RouteMode.LOOP,
        revisionId: 'revision-1',
        revisionNumber: 1,
      }),
    ]);
    prismaService.libraryItem.findMany.mockResolvedValue([
      createLibraryItemRecord({
        id: 'library-item-1',
        kind: LibraryItemKind.PLACE,
        placeId: 'place-1',
        routeId: null,
        sortOrder: 0,
      }),
      createLibraryItemRecord({
        id: 'library-item-2',
        kind: LibraryItemKind.ROUTE,
        placeId: null,
        routeId: 'route-1',
        sortOrder: 1,
      }),
    ]);
    prismaService.syncEvent.findFirst
      .mockResolvedValueOnce({
        id: 7n,
      })
      .mockResolvedValueOnce({
        id: 1n,
      });

    const result = await syncService.bootstrap('user-1');

    expect(result).toMatchObject({
      libraryItems: [
        {
          id: 'library-item-1',
          kind: LibraryItemKind.PLACE,
        },
        {
          id: 'library-item-2',
          kind: LibraryItemKind.ROUTE,
        },
      ],
      places: [
        {
          id: 'place-1',
          name: 'Taipei',
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
      syncCursor: '7',
    });
  });

  it('returns deduplicated upserts and deletions after a cursor', async () => {
    prismaService.syncEvent.findFirst
      .mockResolvedValueOnce({
        id: 9n,
      })
      .mockResolvedValueOnce({
        id: 2n,
      });
    prismaService.syncEvent.findMany.mockResolvedValue([
      createSyncEventRecord({
        entityId: 'place-1',
        entityType: SyncEntityType.PLACE,
        id: 3n,
        operation: SyncOperation.UPSERT,
      }),
      createSyncEventRecord({
        entityId: 'place-1',
        entityType: SyncEntityType.PLACE,
        id: 4n,
        operation: SyncOperation.UPSERT,
      }),
      createSyncEventRecord({
        entityId: 'route-1',
        entityType: SyncEntityType.ROUTE,
        id: 5n,
        operation: SyncOperation.UPSERT,
      }),
      createSyncEventRecord({
        entityId: 'library-item-2',
        entityType: SyncEntityType.LIBRARY_ITEM,
        id: 6n,
        operation: SyncOperation.UPSERT,
      }),
      createSyncEventRecord({
        entityId: 'route-2',
        entityType: SyncEntityType.ROUTE,
        id: 8n,
        operation: SyncOperation.DELETE,
        payload: {
          deletedAt: '2026-05-09T18:00:00.000Z',
        },
      }),
    ]);
    prismaService.place.findMany.mockResolvedValue([
      createPlaceRecord({
        id: 'place-1',
        libraryItemId: 'library-item-1',
        sortOrder: 0,
      }),
    ]);
    prismaService.route.findMany.mockResolvedValue([
      createRouteRecord({
        defaultSpeedKmh: 30,
        id: 'route-1',
        libraryItemId: 'library-item-2',
        mode: RouteMode.PING_PONG,
        revisionId: 'revision-2',
        revisionNumber: 2,
      }),
    ]);
    prismaService.libraryItem.findMany.mockResolvedValue([
      createLibraryItemRecord({
        id: 'library-item-2',
        kind: LibraryItemKind.ROUTE,
        placeId: null,
        routeId: 'route-1',
        sortOrder: 1,
      }),
    ]);

    const result = await syncService.getChanges('user-1', 2n);

    expect(result).toMatchObject({
      deletions: [
        {
          deletedAt: '2026-05-09T18:00:00.000Z',
          entityId: 'route-2',
          entityType: SyncEntityType.ROUTE,
        },
      ],
      libraryItems: [
        {
          id: 'library-item-2',
        },
      ],
      nextCursor: '9',
      places: [
        {
          id: 'place-1',
        },
      ],
      routes: [
        {
          id: 'route-1',
        },
      ],
    });
    expect(prismaService.place.findMany.mock.calls[0]?.[0]).toMatchObject({
      where: {
        id: {
          in: ['place-1'],
        },
      },
    });
  });

  it('rejects a future cursor', async () => {
    prismaService.syncEvent.findFirst.mockResolvedValueOnce({
      id: 4n,
    });
    prismaService.syncEvent.findFirst.mockResolvedValueOnce({
      id: 1n,
    });

    await expect(syncService.getChanges('user-1', 5n)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rejects an expired cursor', async () => {
    prismaService.syncEvent.findFirst.mockResolvedValueOnce({
      id: 6n,
    });
    prismaService.syncEvent.findFirst.mockResolvedValueOnce({
      id: 4n,
    });

    await expect(syncService.getChanges('user-1', 1n)).rejects.toThrow(
      GoneException,
    );
  });
});

function createMockPrismaService(): MockPrismaService {
  const createMock = <TReturn, TArgs extends unknown[]>() =>
    jest.fn<TReturn, TArgs>();

  return {
    libraryItem: {
      findMany: createMock<Promise<MockLibraryItemRecord[]>, [unknown]>(),
    },
    place: {
      findMany: createMock<Promise<MockPlaceRecord[]>, [unknown]>(),
    },
    route: {
      findMany: createMock<Promise<MockRouteRecord[]>, [unknown]>(),
    },
    syncEvent: {
      findFirst: createMock<Promise<{ id: bigint } | null>, [unknown]>(),
      findMany: createMock<Promise<MockSyncEventRecord[]>, [unknown]>(),
    },
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

function createLibraryItemRecord(input: {
  id: string;
  kind: LibraryItemKind;
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
  id: string;
  libraryItemId: string;
  sortOrder: number;
}) {
  return {
    createdAt: new Date('2026-05-09T17:00:00.000Z'),
    deletedAt: null,
    description: 'Test place',
    id: input.id,
    latitude: 25.03,
    libraryItem: createLibraryItemRecord({
      id: input.libraryItemId,
      kind: LibraryItemKind.PLACE,
      placeId: input.id,
      routeId: null,
      sortOrder: input.sortOrder,
    }),
    longitude: 121.56,
    name: 'Taipei',
    tags: ['city'],
    updatedAt: new Date('2026-05-09T17:00:00.000Z'),
  };
}

function createRouteRecord(input: {
  defaultSpeedKmh: number;
  id: string;
  libraryItemId: string;
  mode: RouteMode;
  revisionId: string;
  revisionNumber: number;
}) {
  return {
    createdAt: new Date('2026-05-09T17:00:00.000Z'),
    currentRevision: {
      createdAt: new Date('2026-05-09T17:00:00.000Z'),
      createdBy: 'user-1',
      id: input.revisionId,
      payload: {
        defaultSpeedKmh: input.defaultSpeedKmh,
        mode: input.mode,
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
      revisionNumber: input.revisionNumber,
    },
    defaultSpeedKmh: input.defaultSpeedKmh,
    deletedAt: null,
    description: 'Morning commute',
    id: input.id,
    isPublic: true,
    libraryItem: createLibraryItemRecord({
      id: input.libraryItemId,
      kind: LibraryItemKind.ROUTE,
      placeId: null,
      routeId: input.id,
      sortOrder: 1,
    }),
    mode: input.mode,
    name: 'River ride',
    updatedAt: new Date('2026-05-09T17:00:00.000Z'),
  };
}
