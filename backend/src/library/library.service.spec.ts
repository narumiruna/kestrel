import {
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
} from '../http/errors';
import {
  LibraryItemKind,
  RouteMode,
  SyncEntityType,
  SyncOperation,
} from '@prisma/client';
import { LibraryService } from './library.service';

type MockLibraryItemRecord = ReturnType<typeof createLibraryItemRecord>;
type MockPlaceRecord = ReturnType<typeof createPlaceRecord>;
type MockRouteRecord = ReturnType<typeof createRouteRecord>;

type MockTransactionClient = {
  libraryItem: MockPrismaService['libraryItem'];
  place: MockPrismaService['place'];
  route: MockPrismaService['route'];
  routeRevision: MockPrismaService['routeRevision'];
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
    findFirst: jest.Mock<
      Promise<{ id: string } | { sortOrder: number } | null>,
      [unknown]
    >;
    findMany: jest.Mock<Promise<MockLibraryItemRecord[]>, [unknown]>;
    findUniqueOrThrow: jest.Mock<Promise<MockLibraryItemRecord>, [unknown]>;
    update: jest.Mock<Promise<MockLibraryItemRecord>, [unknown]>;
    updateMany: jest.Mock<Promise<{ count: number }>, [unknown]>;
  };
  place: {
    create: jest.Mock<Promise<{ id: string }>, [unknown]>;
    findFirst: jest.Mock<
      Promise<
        | {
            id: string;
          }
        | {
            id: string;
            libraryItem: { id: string } | null;
          }
        | MockPlaceRecord
        | null
      >,
      [unknown]
    >;
    findMany: jest.Mock<Promise<MockPlaceRecord[]>, [unknown]>;
    findUniqueOrThrow: jest.Mock<Promise<MockPlaceRecord>, [unknown]>;
    update: jest.Mock<Promise<{ id: string }>, [unknown]>;
  };
  route: {
    create: jest.Mock<Promise<{ id: string }>, [unknown]>;
    findFirst: jest.Mock<
      Promise<
        | {
            currentRevision: MockRouteRecord['currentRevision'];
            description: string | null;
            id: string;
            isPublic: boolean;
            name: string;
          }
        | {
            id: string;
            libraryItem: { id: string } | null;
          }
        | null
      >,
      [unknown]
    >;
    findMany: jest.Mock<Promise<MockRouteRecord[]>, [unknown]>;
    findUniqueOrThrow: jest.Mock<Promise<MockRouteRecord>, [unknown]>;
    update: jest.Mock<Promise<{ id: string }>, [unknown]>;
  };
  routeRevision: {
    create: jest.Mock<Promise<{ id: string }>, [unknown]>;
  };
  syncEvent: {
    create: jest.Mock<Promise<{ id: bigint }>, [unknown]>;
  };
};

describe('LibraryService', () => {
  let libraryService: LibraryService;
  let prismaService: MockPrismaService;

  beforeEach(() => {
    prismaService = createMockPrismaService();
    prismaService.$transaction.mockImplementation((callback) =>
      callback({
        libraryItem: prismaService.libraryItem,
        place: prismaService.place,
        route: prismaService.route,
        routeRevision: prismaService.routeRevision,
        syncEvent: prismaService.syncEvent,
      }),
    );
    libraryService = new LibraryService(prismaService as never);
  });

  it('creates a place and library item for the authenticated owner', async () => {
    prismaService.libraryItem.findFirst.mockResolvedValue(null);
    prismaService.place.create.mockResolvedValue({
      id: 'place-1',
    });
    prismaService.libraryItem.create.mockResolvedValue({
      id: 'library-item-1',
    });
    prismaService.place.findUniqueOrThrow.mockResolvedValue(
      createPlaceRecord({
        id: 'place-1',
        libraryItemId: 'library-item-1',
        sortOrder: 0,
      }),
    );

    const result = await libraryService.createPlace('user-1', {
      description: 'Test place',
      latitude: 25.03,
      longitude: 121.56,
      name: 'Taipei',
      tags: ['city'],
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
    expect(prismaService.libraryItem.create).toHaveBeenCalledWith({
      data: {
        kind: LibraryItemKind.PLACE,
        placeId: 'place-1',
        sortOrder: 0,
        userId: 'user-1',
      },
      select: {
        id: true,
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
    expect(result).toMatchObject({
      id: 'place-1',
      libraryItem: {
        id: 'library-item-1',
        kind: LibraryItemKind.PLACE,
        sortOrder: 0,
      },
      name: 'Taipei',
      tags: ['city'],
    });
  });

  it('keeps direct-create normalization and appends after active items', async () => {
    prismaService.libraryItem.findFirst.mockResolvedValue({ sortOrder: 7 });
    prismaService.place.create.mockResolvedValue({ id: 'place-1' });
    prismaService.libraryItem.create.mockResolvedValue({
      id: 'library-item-1',
    });
    prismaService.place.findUniqueOrThrow.mockResolvedValue(
      createPlaceRecord({
        id: 'place-1',
        libraryItemId: 'library-item-1',
        sortOrder: 8,
      }),
    );

    await libraryService.createPlace('user-1', {
      name: '  Taipei  ',
      latitude: 25,
      longitude: 121,
    });

    expect(prismaService.libraryItem.findFirst).toHaveBeenCalledWith({
      orderBy: [{ sortOrder: 'desc' }],
      select: { sortOrder: true },
      where: { deletedAt: null, userId: 'user-1' },
    });
    expect(prismaService.place.create).toHaveBeenCalledWith({
      data: {
        name: 'Taipei',
        description: null,
        latitude: 25,
        longitude: 121,
        tags: [],
        userId: 'user-1',
      },
      select: { id: true },
    });
    expect(prismaService.libraryItem.create).toHaveBeenCalledWith({
      data: {
        kind: LibraryItemKind.PLACE,
        placeId: 'place-1',
        sortOrder: 8,
        userId: 'user-1',
      },
      select: { id: true },
    });
    const calls = [
      prismaService.libraryItem.findFirst.mock.invocationCallOrder[0],
      prismaService.place.create.mock.invocationCallOrder[0],
      prismaService.libraryItem.create.mock.invocationCallOrder[0],
      ...prismaService.syncEvent.create.mock.invocationCallOrder,
      prismaService.place.findUniqueOrThrow.mock.invocationCallOrder[0],
    ];
    expect(calls).toEqual([...calls].sort((a, b) => a - b));
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

  it('propagates place-creation transaction failures without loading a response', async () => {
    prismaService.libraryItem.findFirst.mockResolvedValue(null);
    prismaService.place.create.mockResolvedValue({ id: 'place-1' });
    prismaService.libraryItem.create.mockRejectedValue(
      new Error('insertion failed'),
    );
    await expect(
      libraryService.createPlace('user-1', {
        name: 'Taipei',
        latitude: 25,
        longitude: 121,
      }),
    ).rejects.toThrow('insertion failed');
    expect(prismaService.syncEvent.create).not.toHaveBeenCalled();
    expect(prismaService.place.findUniqueOrThrow).not.toHaveBeenCalled();
  });

  it('increments the library item version when updating a place', async () => {
    prismaService.place.findFirst
      .mockResolvedValueOnce({
        id: 'place-1',
      })
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
    prismaService.libraryItem.updateMany.mockResolvedValue({
      count: 1,
    });

    const result = await libraryService.updatePlace('user-1', 'place-1', {
      description: 'Updated place',
      latitude: 25.04,
      longitude: 121.57,
      name: 'New Taipei',
      tags: ['metro'],
    });

    expect(prismaService.place.update).toHaveBeenCalledWith({
      data: {
        description: 'Updated place',
        latitude: 25.04,
        longitude: 121.57,
        name: 'New Taipei',
        tags: ['metro'],
      },
      where: {
        id: 'place-1',
      },
    });
    expect(prismaService.libraryItem.updateMany).toHaveBeenCalledWith({
      data: {
        version: {
          increment: 1,
        },
      },
      where: {
        deletedAt: null,
        placeId: 'place-1',
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
    ]);
    expect(result).toMatchObject({
      id: 'place-1',
      libraryItem: {
        id: 'library-item-1',
        version: 2,
      },
      name: 'Taipei',
    });
  });

  it('soft deletes a place and bumps the library item version', async () => {
    prismaService.place.findFirst.mockResolvedValue({
      id: 'place-1',
      libraryItem: {
        id: 'library-item-1',
      },
    });
    prismaService.place.update.mockResolvedValue({
      id: 'place-1',
    });
    prismaService.libraryItem.update.mockResolvedValue({
      ...createLibraryItemRecord({
        id: 'library-item-1',
        sortOrder: 0,
        version: 2,
      }),
      kind: LibraryItemKind.PLACE,
      placeId: 'place-1',
      routeId: null,
    });

    const result = await libraryService.deletePlace('user-1', 'place-1');
    const placeUpdateArgs = prismaService.place.update.mock.calls[0]?.[0] as {
      data: { deletedAt: Date };
      where: { id: string };
    };
    const libraryItemUpdateArgs = prismaService.libraryItem.update.mock
      .calls[0]?.[0] as {
      data: { deletedAt: Date; version: { increment: number } };
      where: { id: string };
    };

    expect(placeUpdateArgs.where).toEqual({
      id: 'place-1',
    });
    expect(placeUpdateArgs.data.deletedAt).toBeInstanceOf(Date);
    expect(libraryItemUpdateArgs).toMatchObject({
      data: {
        version: {
          increment: 1,
        },
      },
      where: {
        id: 'library-item-1',
      },
    });
    expect(libraryItemUpdateArgs.data.deletedAt).toBeInstanceOf(Date);
    expect(result).toMatchObject({
      id: 'place-1',
      kind: LibraryItemKind.PLACE,
      libraryItemId: 'library-item-1',
    });
    expectSyncEvents(prismaService.syncEvent.create, [
      {
        entityId: 'library-item-1',
        entityType: SyncEntityType.LIBRARY_ITEM,
        operation: SyncOperation.DELETE,
        userId: 'user-1',
      },
      {
        entityId: 'place-1',
        entityType: SyncEntityType.PLACE,
        operation: SyncOperation.DELETE,
        userId: 'user-1',
      },
    ]);
  });

  it('creates a route with its initial immutable revision', async () => {
    prismaService.libraryItem.findFirst.mockResolvedValue({
      sortOrder: 1,
    });
    prismaService.route.create.mockResolvedValue({
      id: 'route-1',
    });
    prismaService.routeRevision.create.mockResolvedValue({
      id: 'revision-1',
    });
    prismaService.route.update.mockResolvedValue({
      id: 'route-1',
    });
    prismaService.libraryItem.create.mockResolvedValue({
      id: 'library-item-2',
    });
    prismaService.route.findUniqueOrThrow.mockResolvedValue(
      createRouteRecord({
        defaultSpeedKmh: 20,
        id: 'route-1',
        libraryItemId: 'library-item-2',
        mode: RouteMode.LOOP,
        revisionId: 'revision-1',
        revisionNumber: 1,
      }),
    );

    const result = await libraryService.createRoute('user-1', {
      defaultSpeedKmh: 20,
      description: 'Morning commute',
      isPublic: true,
      mode: 'loop',
      name: 'River ride',
      waypoints: [
        {
          latitude: 25.03,
          longitude: 121.56,
          pauseSeconds: 2,
          speedKmh: 10,
        },
        { latitude: 25.04, longitude: 121.57 },
      ],
    });

    expect(prismaService.routeRevision.create).toHaveBeenCalledWith({
      data: {
        createdBy: 'user-1',
        payload: {
          defaultSpeedKmh: 20,
          mode: RouteMode.LOOP,
          waypoints: [
            {
              latitude: 25.03,
              longitude: 121.56,
              pauseSeconds: 2,
              sequence: 0,
              speedKmh: 10,
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
        routeId: 'route-1',
      },
      select: {
        id: true,
      },
    });
    expectSyncEvents(prismaService.syncEvent.create, [
      {
        entityId: 'route-1',
        entityType: SyncEntityType.ROUTE,
        operation: SyncOperation.UPSERT,
        userId: 'user-1',
      },
      {
        entityId: 'library-item-2',
        entityType: SyncEntityType.LIBRARY_ITEM,
        operation: SyncOperation.UPSERT,
        userId: 'user-1',
      },
    ]);
    expect(result).toMatchObject({
      currentRevision: {
        id: 'revision-1',
        revisionNumber: 1,
      },
      defaultSpeedKmh: 20,
      id: 'route-1',
      libraryItem: {
        id: 'library-item-2',
        kind: LibraryItemKind.ROUTE,
      },
      mode: RouteMode.LOOP,
    });
  });

  it('creates a new revision when updating a route', async () => {
    prismaService.route.findFirst.mockResolvedValue({
      currentRevision: {
        createdAt: new Date('2026-05-09T17:00:00.000Z'),
        createdBy: 'user-1',
        id: 'revision-1',
        payload: {
          defaultSpeedKmh: 20,
          mode: RouteMode.ONCE,
          waypoints: [
            {
              latitude: 25.03,
              longitude: 121.56,
              pauseSeconds: 3,
              sequence: 0,
              speedKmh: 18,
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
      description: 'Old route',
      id: 'route-1',
      isPublic: false,
      name: 'Route A',
    });
    prismaService.routeRevision.create.mockResolvedValue({
      id: 'revision-2',
    });
    prismaService.route.update.mockResolvedValue({
      id: 'route-1',
    });
    prismaService.route.findUniqueOrThrow.mockResolvedValue(
      createRouteRecord({
        defaultSpeedKmh: 30,
        id: 'route-1',
        libraryItemId: 'library-item-2',
        mode: RouteMode.PING_PONG,
        revisionId: 'revision-2',
        revisionNumber: 2,
      }),
    );

    const result = await libraryService.updateRoute('user-1', 'route-1', {
      defaultSpeedKmh: 30,
      mode: 'PING_PONG',
    });

    expect(prismaService.routeRevision.create).toHaveBeenCalledWith({
      data: {
        createdBy: 'user-1',
        payload: {
          defaultSpeedKmh: 30,
          mode: RouteMode.PING_PONG,
          waypoints: [
            {
              latitude: 25.03,
              longitude: 121.56,
              pauseSeconds: 3,
              sequence: 0,
              speedKmh: 18,
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
        revisionNumber: 2,
        routeId: 'route-1',
      },
      select: {
        id: true,
      },
    });
    expect(result.currentRevision).toMatchObject({
      id: 'revision-2',
      revisionNumber: 2,
    });
    expectSyncEvents(prismaService.syncEvent.create, [
      {
        entityId: 'route-1',
        entityType: SyncEntityType.ROUTE,
        operation: SyncOperation.UPSERT,
        userId: 'user-1',
      },
    ]);
  });

  it('sorts stored waypoints before reindexing an update and preserves missing metadata', async () => {
    const existingRoute = createRouteRecord({
      defaultSpeedKmh: 0,
      id: 'route-1',
      libraryItemId: 'item-1',
      mode: RouteMode.ONCE,
      revisionId: 'revision-1',
      revisionNumber: 4,
    });
    existingRoute.currentRevision.payload.waypoints = [
      {
        latitude: 25,
        longitude: 121,
        sequence: 9,
        pauseSeconds: null,
        speedKmh: null,
      },
      { latitude: 100, longitude: 121, sequence: -1 },
    ] as never;
    prismaService.route.findFirst.mockResolvedValue(existingRoute);
    prismaService.routeRevision.create.mockResolvedValue({ id: 'revision-2' });
    prismaService.route.findUniqueOrThrow.mockResolvedValue(existingRoute);

    await libraryService.updateRoute('user-1', 'route-1', { name: 'Renamed' });

    expect(prismaService.routeRevision.create).toHaveBeenCalledWith({
      data: {
        createdBy: 'user-1',
        revisionNumber: 5,
        routeId: 'route-1',
        payload: {
          defaultSpeedKmh: 0,
          mode: RouteMode.ONCE,
          waypoints: [
            {
              latitude: 100,
              longitude: 121,
              sequence: 0,
              pauseSeconds: undefined,
              speedKmh: undefined,
            },
            {
              latitude: 25,
              longitude: 121,
              sequence: 1,
              pauseSeconds: null,
              speedKmh: null,
            },
          ],
        },
      },
      select: { id: true },
    });
  });

  it.each([
    [null, 'stored route revision payload is invalid'],
    [[], 'stored route revision payload is invalid'],
    [
      { defaultSpeedKmh: 5, mode: 'once', waypoints: [] },
      'stored route revision payload is invalid',
    ],
    [
      { defaultSpeedKmh: Infinity, mode: 'ONCE', waypoints: [] },
      'stored route revision payload is invalid',
    ],
    [
      { defaultSpeedKmh: 5, mode: 'ONCE', waypoints: [null] },
      'stored route waypoint 0 is invalid',
    ],
    [
      {
        defaultSpeedKmh: 5,
        mode: 'ONCE',
        waypoints: [{ latitude: 25, longitude: 121, sequence: 0.5 }],
      },
      'stored route waypoint 0 is invalid',
    ],
    [
      {
        defaultSpeedKmh: 5,
        mode: 'ONCE',
        waypoints: [
          { latitude: 25, longitude: 121, sequence: 0, speedKmh: '5' },
        ],
      },
      'stored route waypoint 0 is invalid',
    ],
  ])(
    'rejects malformed stored data before creating a revision (%j)',
    async (payload, message) => {
      const existingRoute = createRouteRecord({
        defaultSpeedKmh: 5,
        id: 'route-1',
        libraryItemId: 'item-1',
        mode: RouteMode.ONCE,
        revisionId: 'revision-1',
        revisionNumber: 1,
      });
      existingRoute.currentRevision.payload = payload as never;
      prismaService.route.findFirst.mockResolvedValue(existingRoute);
      await expect(
        libraryService.updateRoute('user-1', 'route-1', { name: 'Renamed' }),
      ).rejects.toThrow(InternalServerErrorException);
      await expect(
        libraryService.updateRoute('user-1', 'route-1', { name: 'Renamed' }),
      ).rejects.toThrow(message);
      expect(prismaService.routeRevision.create).not.toHaveBeenCalled();
      expect(prismaService.route.update).not.toHaveBeenCalled();
      expect(prismaService.syncEvent.create).not.toHaveBeenCalled();
    },
  );

  it('soft deletes a route and its library item', async () => {
    prismaService.route.findFirst.mockResolvedValue({
      id: 'route-1',
      libraryItem: {
        id: 'library-item-2',
      },
    });
    prismaService.route.update.mockResolvedValue({
      id: 'route-1',
    });
    prismaService.libraryItem.update.mockResolvedValue({
      id: 'library-item-2',
    });

    const result = await libraryService.deleteRoute('user-1', 'route-1');
    const routeUpdateArgs = prismaService.route.update.mock.calls[0]?.[0] as {
      data: { deletedAt: Date };
      where: { id: string };
    };
    const libraryItemUpdateArgs = prismaService.libraryItem.update.mock
      .calls[0]?.[0] as {
      data: { deletedAt: Date };
      where: { id: string };
    };

    expect(routeUpdateArgs.where).toEqual({
      id: 'route-1',
    });
    expect(routeUpdateArgs.data.deletedAt).toBeInstanceOf(Date);
    expect(libraryItemUpdateArgs.where).toEqual({
      id: 'library-item-2',
    });
    expect(libraryItemUpdateArgs.data.deletedAt).toBeInstanceOf(Date);
    expect(result).toMatchObject({
      id: 'route-1',
      kind: LibraryItemKind.ROUTE,
      libraryItemId: 'library-item-2',
    });
    expectSyncEvents(prismaService.syncEvent.create, [
      {
        entityId: 'library-item-2',
        entityType: SyncEntityType.LIBRARY_ITEM,
        operation: SyncOperation.DELETE,
        userId: 'user-1',
      },
      {
        entityId: 'route-1',
        entityType: SyncEntityType.ROUTE,
        operation: SyncOperation.DELETE,
        userId: 'user-1',
      },
    ]);
    const firstSyncEventCall: unknown =
      prismaService.syncEvent.create.mock.calls[0]?.[0];
    const secondSyncEventCall: unknown =
      prismaService.syncEvent.create.mock.calls[1]?.[0];
    const firstDeletedAt = (
      firstSyncEventCall as {
        data?: {
          payload?: {
            deletedAt?: unknown;
          };
        };
      }
    ).data?.payload?.deletedAt;
    const secondDeletedAt = (
      secondSyncEventCall as {
        data?: {
          payload?: {
            deletedAt?: unknown;
          };
        };
      }
    ).data?.payload?.deletedAt;

    expect(typeof firstDeletedAt).toBe('string');
    expect(typeof secondDeletedAt).toBe('string');
  });

  it('reorders active library items', async () => {
    const updatedSortOrders = new Map<string, number>();

    prismaService.libraryItem.findMany.mockResolvedValue([
      createLibraryItemRecord({
        id: 'item-1',
        sortOrder: 0,
      }),
      createLibraryItemRecord({
        id: 'item-2',
        sortOrder: 1,
      }),
      createLibraryItemRecord({
        id: 'item-3',
        sortOrder: 2,
      }),
    ]);
    prismaService.libraryItem.update.mockImplementation(
      (args: unknown): Promise<MockLibraryItemRecord> => {
        const { data, where } = args as {
          data: { sortOrder: number };
          where: { id: string };
        };

        updatedSortOrders.set(where.id, data.sortOrder);

        return Promise.resolve(
          createLibraryItemRecord({
            id: where.id,
            sortOrder: data.sortOrder,
          }),
        );
      },
    );
    prismaService.libraryItem.findUniqueOrThrow.mockResolvedValue(
      createLibraryItemRecord({
        id: 'item-1',
        sortOrder: 2,
      }),
    );

    const result = await libraryService.reorderLibraryItem('user-1', {
      itemId: 'item-1',
      toIndex: 2,
    });

    expect(updatedSortOrders).toEqual(
      new Map([
        ['item-2', 0],
        ['item-3', 1],
        ['item-1', 2],
      ]),
    );
    expect(result).toMatchObject({
      id: 'item-1',
      sortOrder: 2,
    });
    expectSyncEvents(prismaService.syncEvent.create, [
      {
        entityId: 'item-1',
        entityType: SyncEntityType.LIBRARY_ITEM,
        operation: SyncOperation.UPSERT,
        userId: 'user-1',
      },
    ]);
  });

  it('touches an active library item', async () => {
    prismaService.libraryItem.findFirst.mockResolvedValue({
      id: 'item-1',
    });
    prismaService.libraryItem.update.mockResolvedValue(
      createLibraryItemRecord({
        id: 'item-1',
        lastUsedAt: new Date('2026-05-09T17:30:00.000Z'),
      }),
    );

    const result = await libraryService.touchLibraryItem('user-1', 'item-1');
    const updateArgs = prismaService.libraryItem.update.mock.calls[0]?.[0] as {
      data: { lastUsedAt: Date };
      where: { id: string };
    };

    expect(updateArgs.where).toEqual({
      id: 'item-1',
    });
    expect(updateArgs.data.lastUsedAt).toBeInstanceOf(Date);
    expect(result).toMatchObject({
      id: 'item-1',
      lastUsedAt: new Date('2026-05-09T17:30:00.000Z'),
    });
    expectSyncEvents(prismaService.syncEvent.create, [
      {
        entityId: 'item-1',
        entityType: SyncEntityType.LIBRARY_ITEM,
        operation: SyncOperation.UPSERT,
        userId: 'user-1',
      },
    ]);
  });

  it('validates route payloads before hitting Prisma', async () => {
    await expect(
      libraryService.createRoute('user-1', {
        defaultSpeedKmh: 20,
        mode: 'WRONG',
        name: 'Invalid route',
        waypoints: [
          { latitude: 25.03, longitude: 121.56 },
          { latitude: 25.04, longitude: 121.57 },
        ],
      }),
    ).rejects.toThrow(BadRequestException);
    expect(prismaService.$transaction).not.toHaveBeenCalled();
  });

  it('throws not found when touching an item owned by another user', async () => {
    prismaService.libraryItem.findFirst.mockResolvedValue(null);

    await expect(
      libraryService.touchLibraryItem('user-1', 'missing-item'),
    ).rejects.toThrow(NotFoundException);
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
      findFirst: createMock<
        Promise<{ id: string } | { sortOrder: number } | null>,
        [unknown]
      >(),
      findMany: createMock<Promise<MockLibraryItemRecord[]>, [unknown]>(),
      findUniqueOrThrow: createMock<
        Promise<MockLibraryItemRecord>,
        [unknown]
      >(),
      update: createMock<Promise<MockLibraryItemRecord>, [unknown]>(),
      updateMany: createMock<Promise<{ count: number }>, [unknown]>(),
    },
    place: {
      create: createMock<Promise<{ id: string }>, [unknown]>(),
      findFirst: createMock<
        Promise<
          | {
              id: string;
            }
          | {
              id: string;
              libraryItem: { id: string } | null;
            }
          | MockPlaceRecord
          | null
        >,
        [unknown]
      >(),
      findMany: createMock<Promise<MockPlaceRecord[]>, [unknown]>(),
      findUniqueOrThrow: createMock<Promise<MockPlaceRecord>, [unknown]>(),
      update: createMock<Promise<{ id: string }>, [unknown]>(),
    },
    route: {
      create: createMock<Promise<{ id: string }>, [unknown]>(),
      findFirst: createMock<
        Promise<
          | {
              currentRevision: MockRouteRecord['currentRevision'];
              description: string | null;
              id: string;
              isPublic: boolean;
              name: string;
            }
          | {
              id: string;
              libraryItem: { id: string } | null;
            }
          | null
        >,
        [unknown]
      >(),
      findMany: createMock<Promise<MockRouteRecord[]>, [unknown]>(),
      findUniqueOrThrow: createMock<Promise<MockRouteRecord>, [unknown]>(),
      update: createMock<Promise<{ id: string }>, [unknown]>(),
    },
    routeRevision: {
      create: createMock<Promise<{ id: string }>, [unknown]>(),
    },
    syncEvent: {
      create: createMock<Promise<{ id: bigint }>, [unknown]>(),
    },
  };
}

function createLibraryItemRecord(input: {
  id: string;
  lastUsedAt?: Date | null;
  sortOrder: number;
  version?: number;
}) {
  return {
    createdAt: new Date('2026-05-09T17:00:00.000Z'),
    deletedAt: null,
    id: input.id,
    kind: LibraryItemKind.ROUTE,
    lastUsedAt: input.lastUsedAt ?? null,
    pinned: false,
    placeId: null,
    routeId: 'route-1',
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
    libraryItem: {
      ...createLibraryItemRecord({
        id: input.libraryItemId,
        sortOrder: input.sortOrder,
        version: input.version,
      }),
      kind: LibraryItemKind.PLACE,
      placeId: input.id,
      routeId: null,
    },
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
    libraryItem: {
      ...createLibraryItemRecord({
        id: input.libraryItemId,
        sortOrder: 2,
      }),
      kind: LibraryItemKind.ROUTE,
      routeId: input.id,
    },
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
