import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  GoneException,
} from '@nestjs/common';
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

type MockTransactionClient = {
  libraryItem: MockPrismaService['libraryItem'];
  place: MockPrismaService['place'];
  syncEvent: MockPrismaService['syncEvent'];
};

type MockPrismaService = {
  $transaction: jest.Mock<
    Promise<unknown>,
    [
      (
        callback: (tx: MockTransactionClient) => Promise<unknown>,
      ) => Promise<unknown>,
    ]
  >;
  libraryItem: {
    create: jest.Mock<Promise<{ id: string }>, [unknown]>;
    findFirst: jest.Mock<Promise<{ sortOrder: number } | null>, [unknown]>;
    findMany: jest.Mock<Promise<MockLibraryItemRecord[]>, [unknown]>;
    update: jest.Mock<Promise<MockLibraryItemRecord>, [unknown]>;
  };
  place: {
    create: jest.Mock<Promise<{ id: string }>, [unknown]>;
    findFirst: jest.Mock<Promise<MockPlaceRecord | null>, [unknown]>;
    findMany: jest.Mock<Promise<MockPlaceRecord[]>, [unknown]>;
    update: jest.Mock<Promise<{ id: string }>, [unknown]>;
  };
  route: {
    findMany: jest.Mock<Promise<MockRouteRecord[]>, [unknown]>;
  };
  syncEvent: {
    create: jest.Mock<Promise<{ id: bigint }>, [unknown]>;
    findFirst: jest.Mock<Promise<{ id: bigint } | null>, [unknown]>;
    findMany: jest.Mock<Promise<MockSyncEventRecord[]>, [unknown]>;
  };
  syncUploadMutation: {
    create: jest.Mock<Promise<{ id: string }>, [unknown]>;
    findUnique: jest.Mock<
      Promise<{ requestHash: string; result: Prisma.JsonValue } | null>,
      [unknown]
    >;
  };
};

describe('SyncService', () => {
  let prismaService: MockPrismaService;
  let syncService: SyncService;

  beforeEach(() => {
    prismaService = createMockPrismaService();
    prismaService.$transaction.mockImplementation((callback) =>
      callback({
        libraryItem: prismaService.libraryItem,
        place: prismaService.place,
        syncEvent: prismaService.syncEvent,
      }),
    );
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

  it('uploads a local-only place and persists the idempotent result', async () => {
    prismaService.syncUploadMutation.findUnique.mockResolvedValue(null);
    prismaService.libraryItem.findFirst.mockResolvedValue(null);
    prismaService.place.create.mockResolvedValue({
      id: 'place-1',
    });
    prismaService.libraryItem.create.mockResolvedValue({
      id: 'library-item-1',
    });
    prismaService.place.findFirst.mockResolvedValue(
      createPlaceRecord({
        id: 'place-1',
        libraryItemId: 'library-item-1',
        sortOrder: 0,
      }),
    );
    prismaService.syncUploadMutation.create.mockResolvedValue({
      id: 'mutation-1',
    });

    const result = await syncService.upload('user-1', {
      changes: [
        {
          clientMutationId: 'mutation-1',
          place: {
            description: 'Test place',
            latitude: 25.03,
            longitude: 121.56,
            name: 'Taipei',
            tags: ['city'],
          },
          type: 'PLACE_CREATE',
        },
      ],
    });

    expect(result).toMatchObject({
      conflicts: [],
      failed: [],
      uploaded: [
        {
          clientMutationId: 'mutation-1',
          libraryItem: {
            id: 'library-item-1',
            version: 1,
          },
          place: {
            id: 'place-1',
            name: 'Taipei',
          },
          status: 'uploaded',
        },
      ],
    });
    expect(prismaService.place.create).toHaveBeenCalledWith({
      data: {
        description: 'Test place',
        latitude: 25.03,
        longitude: 121.56,
        name: 'Taipei',
        tags: ['city'],
        userId: 'user-1',
      },
      select: {
        id: true,
      },
    });
    expect(
      prismaService.syncUploadMutation.create.mock.calls[0]?.[0],
    ).toMatchObject({
      data: {
        clientMutationId: 'mutation-1',
        userId: 'user-1',
      },
    });
    expectSyncEvents(prismaService.syncEvent.create, [
      {
        entityId: 'place-1',
        entityType: SyncEntityType.PLACE,
        operation: SyncOperation.UPSERT,
        userId: 'user-1',
      },
      {
        entityId: 'library-item-1',
        entityType: SyncEntityType.LIBRARY_ITEM,
        operation: SyncOperation.UPSERT,
        userId: 'user-1',
      },
    ]);
  });

  it('reuses the stored upload result when clientMutationId and payload match', async () => {
    const reusedResult = {
      clientMutationId: 'mutation-1',
      libraryItem: {
        id: 'library-item-1',
      },
      place: {
        id: 'place-1',
      },
      status: 'uploaded',
    } satisfies Prisma.JsonObject;
    prismaService.syncUploadMutation.findUnique.mockResolvedValue({
      requestHash: hashUploadChange({
        clientMutationId: 'mutation-1',
        place: {
          latitude: 25.03,
          longitude: 121.56,
          name: 'Taipei',
        },
        type: 'PLACE_CREATE',
      }),
      result: reusedResult,
    });

    const result = await syncService.upload('user-1', {
      changes: [
        {
          clientMutationId: 'mutation-1',
          place: {
            latitude: 25.03,
            longitude: 121.56,
            name: 'Taipei',
          },
          type: 'PLACE_CREATE',
        },
      ],
    });

    expect(result).toMatchObject({
      conflicts: [],
      failed: [],
      uploaded: [reusedResult],
    });
    expect(prismaService.$transaction).not.toHaveBeenCalled();
    expect(prismaService.syncUploadMutation.create).not.toHaveBeenCalled();
  });

  it('rejects clientMutationId reuse with a different payload', async () => {
    prismaService.syncUploadMutation.findUnique.mockResolvedValue({
      requestHash: 'different-hash',
      result: {
        clientMutationId: 'mutation-1',
        status: 'uploaded',
      },
    });

    await expect(
      syncService.upload('user-1', {
        changes: [
          {
            clientMutationId: 'mutation-1',
            place: {
              latitude: 25.03,
              longitude: 121.56,
              name: 'Taipei',
            },
            type: 'PLACE_CREATE',
          },
        ],
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('returns uploaded and failed results in the same upload batch', async () => {
    prismaService.syncUploadMutation.findUnique.mockResolvedValue(null);
    prismaService.libraryItem.findFirst.mockResolvedValue(null);
    prismaService.place.create.mockResolvedValue({
      id: 'place-1',
    });
    prismaService.libraryItem.create.mockResolvedValue({
      id: 'library-item-1',
    });
    prismaService.place.findFirst.mockResolvedValue(
      createPlaceRecord({
        id: 'place-1',
        libraryItemId: 'library-item-1',
        sortOrder: 0,
      }),
    );
    prismaService.syncUploadMutation.create.mockResolvedValue({
      id: 'mutation-1',
    });

    const result = await syncService.upload('user-1', {
      changes: [
        {
          clientMutationId: 'mutation-1',
          place: {
            latitude: 25.03,
            longitude: 121.56,
            name: 'Taipei',
          },
          type: 'PLACE_CREATE',
        },
        {
          clientMutationId: 'mutation-2',
          expectedVersion: 1,
          place: {
            latitude: 25.04,
            longitude: 121.57,
            name: 'Updated Taipei',
          },
          type: 'PLACE_UPDATE',
        },
      ],
    });

    expect(result.uploaded).toHaveLength(1);
    expect(result.failed).toMatchObject([
      {
        clientMutationId: 'mutation-2',
        message: 'remotePlaceId is required',
        status: 'failed',
      },
    ]);
    expect(result.conflicts).toEqual([]);
  });

  it('uploads a synced place update when the expected version matches', async () => {
    prismaService.syncUploadMutation.findUnique.mockResolvedValue(null);
    prismaService.place.findFirst
      .mockResolvedValueOnce(
        createPlaceRecord({
          id: 'place-1',
          libraryItemId: 'library-item-1',
          sortOrder: 0,
          version: 1,
        }),
      )
      .mockResolvedValueOnce(
        createPlaceRecord({
          id: 'place-1',
          libraryItemId: 'library-item-1',
          sortOrder: 0,
          version: 2,
        }),
      );
    prismaService.place.update.mockResolvedValue({
      id: 'place-1',
    });
    prismaService.libraryItem.update.mockResolvedValue(
      createLibraryItemRecord({
        id: 'library-item-1',
        kind: LibraryItemKind.PLACE,
        placeId: 'place-1',
        routeId: null,
        sortOrder: 0,
        version: 2,
      }),
    );
    prismaService.syncUploadMutation.create.mockResolvedValue({
      id: 'mutation-1',
    });

    const result = await syncService.upload('user-1', {
      changes: [
        {
          clientMutationId: 'mutation-1',
          expectedVersion: 1,
          place: {
            description: 'Updated place',
            latitude: 25.04,
            longitude: 121.57,
            name: 'Updated Taipei',
            tags: ['metro'],
          },
          remotePlaceId: 'place-1',
          type: 'PLACE_UPDATE',
        },
      ],
    });

    expect(result).toMatchObject({
      conflicts: [],
      failed: [],
      uploaded: [
        {
          clientMutationId: 'mutation-1',
          libraryItem: {
            id: 'library-item-1',
            version: 2,
          },
          place: {
            id: 'place-1',
            name: 'Taipei',
          },
          status: 'uploaded',
        },
      ],
    });
    expect(prismaService.place.update).toHaveBeenCalledWith({
      data: {
        description: 'Updated place',
        latitude: 25.04,
        longitude: 121.57,
        name: 'Updated Taipei',
        tags: ['metro'],
      },
      where: {
        id: 'place-1',
      },
    });
    expect(prismaService.libraryItem.update).toHaveBeenCalledWith({
      data: {
        version: {
          increment: 1,
        },
      },
      where: {
        id: 'library-item-1',
      },
    });
    expectSyncEvents(prismaService.syncEvent.create, [
      {
        entityId: 'place-1',
        entityType: SyncEntityType.PLACE,
        operation: SyncOperation.UPSERT,
        userId: 'user-1',
      },
      {
        entityId: 'library-item-1',
        entityType: SyncEntityType.LIBRARY_ITEM,
        operation: SyncOperation.UPSERT,
        userId: 'user-1',
      },
    ]);
  });

  it('returns a conflict snapshot when an update hits a newer remote version', async () => {
    prismaService.syncUploadMutation.findUnique.mockResolvedValue(null);
    prismaService.place.findFirst.mockResolvedValue(
      createPlaceRecord({
        id: 'place-1',
        libraryItemId: 'library-item-1',
        sortOrder: 0,
        version: 2,
      }),
    );
    prismaService.syncUploadMutation.create.mockResolvedValue({
      id: 'mutation-1',
    });

    const result = await syncService.upload('user-1', {
      changes: [
        {
          clientMutationId: 'mutation-1',
          expectedVersion: 1,
          place: {
            latitude: 25.04,
            longitude: 121.57,
            name: 'Updated Taipei',
          },
          remotePlaceId: 'place-1',
          type: 'PLACE_UPDATE',
        },
      ],
    });

    expect(result).toMatchObject({
      conflicts: [
        {
          clientMutationId: 'mutation-1',
          cloudLibraryItem: {
            id: 'library-item-1',
            version: 2,
          },
          cloudPlace: {
            id: 'place-1',
          },
          reason: 'remote version changed',
          status: 'conflict',
        },
      ],
      failed: [],
      uploaded: [],
    });
    expect(prismaService.place.update).not.toHaveBeenCalled();
  });

  it('returns a conflict snapshot when a delete hits a newer remote version', async () => {
    prismaService.syncUploadMutation.findUnique.mockResolvedValue(null);
    prismaService.place.findFirst.mockResolvedValue(
      createPlaceRecord({
        id: 'place-1',
        libraryItemId: 'library-item-1',
        sortOrder: 0,
        version: 2,
      }),
    );
    prismaService.syncUploadMutation.create.mockResolvedValue({
      id: 'mutation-1',
    });

    const result = await syncService.upload('user-1', {
      changes: [
        {
          clientMutationId: 'mutation-1',
          expectedVersion: 1,
          remotePlaceId: 'place-1',
          type: 'PLACE_DELETE',
        },
      ],
    });

    expect(result).toMatchObject({
      conflicts: [
        {
          clientMutationId: 'mutation-1',
          cloudLibraryItem: {
            id: 'library-item-1',
            version: 2,
          },
          cloudPlace: {
            id: 'place-1',
          },
          reason: 'remote version changed',
          status: 'conflict',
        },
      ],
      failed: [],
      uploaded: [],
    });
    expect(prismaService.place.update).not.toHaveBeenCalled();
    expect(prismaService.libraryItem.update).not.toHaveBeenCalled();
  });

  it('soft deletes a remote place and emits delete sync events', async () => {
    prismaService.syncUploadMutation.findUnique.mockResolvedValue(null);
    prismaService.place.findFirst.mockResolvedValue(
      createPlaceRecord({
        id: 'place-1',
        libraryItemId: 'library-item-1',
        sortOrder: 0,
        version: 1,
      }),
    );
    prismaService.place.update.mockResolvedValue({
      id: 'place-1',
    });
    prismaService.libraryItem.update.mockResolvedValue(
      createLibraryItemRecord({
        id: 'library-item-1',
        kind: LibraryItemKind.PLACE,
        placeId: 'place-1',
        routeId: null,
        sortOrder: 0,
        version: 2,
      }),
    );
    prismaService.syncUploadMutation.create.mockResolvedValue({
      id: 'mutation-1',
    });

    const result = await syncService.upload('user-1', {
      changes: [
        {
          clientMutationId: 'mutation-1',
          expectedVersion: 1,
          remotePlaceId: 'place-1',
          type: 'PLACE_DELETE',
        },
      ],
    });

    expect(result).toMatchObject({
      conflicts: [],
      failed: [],
      uploaded: [
        {
          clientMutationId: 'mutation-1',
          status: 'uploaded',
        },
      ],
    });
    const placeUpdateCall = prismaService.place.update.mock.calls[0]?.[0] as {
      data: { deletedAt: Date };
      where: { id: string };
    };
    const libraryItemUpdateCall = prismaService.libraryItem.update.mock
      .calls[0]?.[0] as {
      data: { deletedAt: Date; version: { increment: number } };
      where: { id: string };
    };

    expect(placeUpdateCall.where).toEqual({
      id: 'place-1',
    });
    expect(placeUpdateCall.data.deletedAt).toBeInstanceOf(Date);
    expect(libraryItemUpdateCall).toMatchObject({
      data: {
        version: {
          increment: 1,
        },
      },
      where: {
        id: 'library-item-1',
      },
    });
    expectSyncEvents(prismaService.syncEvent.create, [
      {
        entityId: 'place-1',
        entityType: SyncEntityType.PLACE,
        operation: SyncOperation.DELETE,
        userId: 'user-1',
      },
      {
        entityId: 'library-item-1',
        entityType: SyncEntityType.LIBRARY_ITEM,
        operation: SyncOperation.DELETE,
        userId: 'user-1',
      },
    ]);
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
    $transaction: createMock<
      Promise<unknown>,
      [
        (
          callback: (tx: MockTransactionClient) => Promise<unknown>,
        ) => Promise<unknown>,
      ]
    >(),
    libraryItem: {
      create: createMock<Promise<{ id: string }>, [unknown]>(),
      findFirst: createMock<Promise<{ sortOrder: number } | null>, [unknown]>(),
      findMany: createMock<Promise<MockLibraryItemRecord[]>, [unknown]>(),
      update: createMock<Promise<MockLibraryItemRecord>, [unknown]>(),
    },
    place: {
      create: createMock<Promise<{ id: string }>, [unknown]>(),
      findFirst: createMock<Promise<MockPlaceRecord | null>, [unknown]>(),
      findMany: createMock<Promise<MockPlaceRecord[]>, [unknown]>(),
      update: createMock<Promise<{ id: string }>, [unknown]>(),
    },
    route: {
      findMany: createMock<Promise<MockRouteRecord[]>, [unknown]>(),
    },
    syncEvent: {
      create: createMock<Promise<{ id: bigint }>, [unknown]>(),
      findFirst: createMock<Promise<{ id: bigint } | null>, [unknown]>(),
      findMany: createMock<Promise<MockSyncEventRecord[]>, [unknown]>(),
    },
    syncUploadMutation: {
      create: createMock<Promise<{ id: string }>, [unknown]>(),
      findUnique: createMock<
        Promise<{ requestHash: string; result: Prisma.JsonValue } | null>,
        [unknown]
      >(),
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
  version?: number;
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
    version: input.version ?? 1,
  };
}

function createPlaceRecord(input: {
  id: string;
  libraryItemId: string;
  sortOrder: number;
  version?: number;
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
      version: input.version,
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

function expectSyncEvents(
  createMock: jest.Mock<Promise<{ id: bigint }>, [unknown]>,
  expectedData: unknown[],
) {
  expect(createMock.mock.calls).toHaveLength(expectedData.length);
  expectedData.forEach((expectedEvent, index) => {
    expect(createMock.mock.calls[index]?.[0]).toMatchObject({
      data: expectedEvent,
    });
  });
}

function hashUploadChange(change: Record<string, unknown>) {
  return createHash('sha256').update(JSON.stringify(change)).digest('hex');
}
