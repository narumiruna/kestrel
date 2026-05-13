import {
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import {
  LibraryItemKind,
  RouteMode,
  SyncEntityType,
  SyncOperation,
} from '@prisma/client';
import { SharingService } from './sharing.service';

describe('SharingService', () => {
  let sharingService: SharingService;
  let prismaService: ReturnType<typeof createMockPrismaService>;

  beforeEach(() => {
    prismaService = createMockPrismaService();
    prismaService.$transaction.mockImplementation((callback) =>
      callback({
        libraryItem: prismaService.libraryItem,
        route: prismaService.route,
        routeRevision: prismaService.routeRevision,
        shareLink: prismaService.shareLink,
        syncEvent: prismaService.syncEvent,
      }),
    );
    sharingService = new SharingService(prismaService as never);
  });

  it('returns not found when a different owner asks for a route share link', async () => {
    prismaService.route.findFirst.mockResolvedValue(null);

    await expect(
      sharingService.getRouteShareLink('user-1', 'route-1'),
    ).rejects.toThrow(NotFoundException);
  });

  it('creates one latest share link per owner route and reuses it later', async () => {
    prismaService.route.findFirst
      .mockResolvedValueOnce({
        currentRevisionId: 'revision-1',
        id: 'route-1',
      })
      .mockResolvedValueOnce({
        id: 'route-1',
      });
    prismaService.shareLink.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(
        createShareLinkRecord({
          disabledAt: null,
          routeId: 'route-1',
          token: 'share-token-1',
        }),
      );
    prismaService.shareLink.create.mockResolvedValue(
      createShareLinkRecord({
        disabledAt: null,
        routeId: 'route-1',
        token: 'share-token-1',
      }),
    );

    const created = await sharingService.createRouteShareLink(
      'user-1',
      'route-1',
    );
    const fetched = await sharingService.getRouteShareLink('user-1', 'route-1');

    expect(created).toMatchObject({
      publicUrl: '/share/share-token-1',
      routeId: 'route-1',
      token: 'share-token-1',
    });
    expect(fetched).toMatchObject({
      publicUrl: '/share/share-token-1',
      token: 'share-token-1',
    });
    expect(prismaService.shareLink.create).toHaveBeenCalledTimes(1);
  });

  it('disables and re-enables an existing share link', async () => {
    prismaService.route.findFirst.mockResolvedValue({
      id: 'route-1',
    });
    prismaService.shareLink.findFirst.mockResolvedValue(
      createShareLinkRecord({
        disabledAt: null,
        routeId: 'route-1',
        token: 'share-token-1',
      }),
    );
    prismaService.shareLink.update
      .mockResolvedValueOnce(
        createShareLinkRecord({
          disabledAt: new Date('2026-05-13T12:00:00.000Z'),
          routeId: 'route-1',
          token: 'share-token-1',
        }),
      )
      .mockResolvedValueOnce(
        createShareLinkRecord({
          disabledAt: null,
          routeId: 'route-1',
          token: 'share-token-1',
        }),
      );

    const disabled = await sharingService.updateRouteShareLink(
      'user-1',
      'route-1',
      {
        disabled: true,
      },
    );
    const enabled = await sharingService.updateRouteShareLink(
      'user-1',
      'route-1',
      {
        disabled: false,
      },
    );

    expect(disabled.disabledAt).toEqual(new Date('2026-05-13T12:00:00.000Z'));
    expect(enabled.disabledAt).toBeNull();
  });

  it('rejects disabled public links', async () => {
    prismaService.shareLink.findUnique.mockResolvedValue(
      createPublicShareRecord({
        disabledAt: new Date('2026-05-13T12:00:00.000Z'),
      }),
    );

    await expect(
      sharingService.getSharedRoute('share-token-1'),
    ).rejects.toThrow(NotFoundException);
  });

  it('rejects expired public links', async () => {
    prismaService.shareLink.findUnique.mockResolvedValue(
      createPublicShareRecord({
        expiresAt: new Date('2026-05-12T12:00:00.000Z'),
      }),
    );

    await expect(
      sharingService.getSharedRoute('share-token-1'),
    ).rejects.toThrow(NotFoundException);
  });

  it('returns a sanitized public route snapshot without owner metadata', async () => {
    prismaService.shareLink.findUnique.mockResolvedValue(
      createPublicShareRecord({}),
    );

    const result = await sharingService.getSharedRoute('share-token-1');

    expect(result).toMatchObject({
      route: {
        description: 'Morning commute',
        name: 'River ride',
        revision: {
          defaultSpeedKmh: 24,
          mode: RouteMode.LOOP,
          revisionNumber: 3,
        },
      },
      shareLink: {
        publicUrl: '/share/share-token-1',
        token: 'share-token-1',
      },
    });
    expect(result.route.revision.waypoints[0]).toMatchObject({
      latitude: 25.03,
      longitude: 121.56,
      pauseSeconds: null,
      sequence: 0,
      speedKmh: null,
    });
    expect(result.route.revision).not.toHaveProperty('createdBy');
    expect(result.route).not.toHaveProperty('id');
  });

  it('copies the currently visible shared snapshot into the caller library', async () => {
    prismaService.shareLink.findUnique.mockResolvedValue(
      createPublicShareRecord({}),
    );
    prismaService.libraryItem.findFirst.mockResolvedValue({
      sortOrder: 4,
    });
    prismaService.route.create.mockResolvedValue({
      id: 'copied-route-1',
    });
    prismaService.routeRevision.create.mockResolvedValue({
      id: 'copied-revision-1',
    });
    prismaService.route.update.mockResolvedValue({
      id: 'copied-route-1',
    });
    prismaService.libraryItem.create.mockResolvedValue({
      id: 'library-item-9',
    });
    prismaService.route.findUniqueOrThrow.mockResolvedValue(
      createRouteRecord({
        defaultSpeedKmh: 24,
        id: 'copied-route-1',
        libraryItemId: 'library-item-9',
        mode: RouteMode.LOOP,
        revisionId: 'copied-revision-1',
        revisionNumber: 1,
      }),
    );

    const copiedRoute = await sharingService.copySharedRoute(
      'user-2',
      'share-token-1',
    );

    expect(prismaService.route.create).toHaveBeenCalledWith({
      data: {
        defaultSpeedKmh: 24,
        description: 'Morning commute',
        isPublic: false,
        mode: RouteMode.LOOP,
        name: 'River ride',
        userId: 'user-2',
      },
      select: {
        id: true,
      },
    });
    expect(prismaService.routeRevision.create).toHaveBeenCalledWith({
      data: {
        createdBy: 'user-2',
        payload: {
          defaultSpeedKmh: 24,
          mode: RouteMode.LOOP,
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
        routeId: 'copied-route-1',
      },
      select: {
        id: true,
      },
    });
    expect(prismaService.libraryItem.create).toHaveBeenCalledWith({
      data: {
        kind: LibraryItemKind.ROUTE,
        routeId: 'copied-route-1',
        sortOrder: 5,
        userId: 'user-2',
      },
      select: {
        id: true,
      },
    });
    expectSyncEvents(prismaService.syncEvent.create, [
      {
        entityId: 'copied-route-1',
        entityType: SyncEntityType.ROUTE,
        operation: SyncOperation.UPSERT,
        userId: 'user-2',
      },
      {
        entityId: 'library-item-9',
        entityType: SyncEntityType.LIBRARY_ITEM,
        operation: SyncOperation.UPSERT,
        userId: 'user-2',
      },
    ]);
    expect(copiedRoute).toMatchObject({
      currentRevision: {
        id: 'copied-revision-1',
        revisionNumber: 1,
      },
      id: 'copied-route-1',
      libraryItem: {
        id: 'library-item-9',
      },
      mode: RouteMode.LOOP,
      name: 'River ride',
    });
  });

  it('rejects creating a share link for a route missing its current revision', async () => {
    prismaService.route.findFirst.mockResolvedValue({
      currentRevisionId: null,
      id: 'route-1',
    });

    await expect(
      sharingService.createRouteShareLink('user-1', 'route-1'),
    ).rejects.toThrow(InternalServerErrorException);
  });
});

function createMockPrismaService() {
  const createMock = <TReturn, TArgs extends unknown[]>() =>
    jest.fn<TReturn, TArgs>();

  return {
    $transaction: createMock<
      Promise<unknown>,
      [
        (
          callback: (tx: {
            libraryItem: {
              create: jest.Mock<Promise<{ id: string }>, [unknown]>;
              findFirst: jest.Mock<
                Promise<{ sortOrder: number } | null>,
                [unknown]
              >;
            };
            route: {
              create: jest.Mock<Promise<{ id: string }>, [unknown]>;
              findFirst: jest.Mock<
                Promise<Record<string, unknown> | null>,
                [unknown]
              >;
              findUniqueOrThrow: jest.Mock<
                Promise<ReturnType<typeof createRouteRecord>>,
                [unknown]
              >;
              update: jest.Mock<Promise<{ id: string }>, [unknown]>;
            };
            routeRevision: {
              create: jest.Mock<Promise<{ id: string }>, [unknown]>;
            };
            shareLink: {
              create: jest.Mock<
                Promise<ReturnType<typeof createShareLinkRecord>>,
                [unknown]
              >;
              findFirst: jest.Mock<
                Promise<ReturnType<typeof createShareLinkRecord> | null>,
                [unknown]
              >;
              findUnique: jest.Mock<
                Promise<ReturnType<typeof createPublicShareRecord> | null>,
                [unknown]
              >;
              update: jest.Mock<
                Promise<ReturnType<typeof createShareLinkRecord>>,
                [unknown]
              >;
            };
            syncEvent: {
              create: jest.Mock<Promise<{ id: bigint }>, [unknown]>;
            };
          }) => Promise<unknown>,
        ) => Promise<unknown>,
      ]
    >(),
    libraryItem: {
      create: createMock<Promise<{ id: string }>, [unknown]>(),
      findFirst: createMock<Promise<{ sortOrder: number } | null>, [unknown]>(),
    },
    route: {
      create: createMock<Promise<{ id: string }>, [unknown]>(),
      findFirst: createMock<
        Promise<Record<string, unknown> | null>,
        [unknown]
      >(),
      findUniqueOrThrow: createMock<
        Promise<ReturnType<typeof createRouteRecord>>,
        [unknown]
      >(),
      update: createMock<Promise<{ id: string }>, [unknown]>(),
    },
    routeRevision: {
      create: createMock<Promise<{ id: string }>, [unknown]>(),
    },
    shareLink: {
      create: createMock<
        Promise<ReturnType<typeof createShareLinkRecord>>,
        [unknown]
      >(),
      findFirst: createMock<
        Promise<ReturnType<typeof createShareLinkRecord> | null>,
        [unknown]
      >(),
      findUnique: createMock<
        Promise<ReturnType<typeof createPublicShareRecord> | null>,
        [unknown]
      >(),
      update: createMock<
        Promise<ReturnType<typeof createShareLinkRecord>>,
        [unknown]
      >(),
    },
    syncEvent: {
      create: createMock<Promise<{ id: bigint }>, [unknown]>(),
    },
  };
}

function createShareLinkRecord(input: {
  disabledAt: Date | null;
  expiresAt?: Date | null;
  routeId: string;
  token: string;
}) {
  return {
    createdAt: new Date('2026-05-13T10:00:00.000Z'),
    disabledAt: input.disabledAt,
    expiresAt: input.expiresAt ?? null,
    id: 'share-link-1',
    permission: 'PUBLIC_READ' as const,
    routeId: input.routeId,
    routeRevisionId: null,
    token: input.token,
    updatedAt: new Date('2026-05-13T10:00:00.000Z'),
  };
}

function createPublicShareRecord(input: {
  disabledAt?: Date | null;
  expiresAt?: Date | null;
}) {
  return {
    createdAt: new Date('2026-05-13T10:00:00.000Z'),
    disabledAt: input.disabledAt ?? null,
    expiresAt: input.expiresAt ?? null,
    id: 'share-link-1',
    permission: 'PUBLIC_READ' as const,
    route: {
      currentRevision: {
        createdAt: new Date('2026-05-13T09:00:00.000Z'),
        createdBy: 'user-1',
        id: 'revision-3',
        payload: {
          defaultSpeedKmh: 24,
          mode: RouteMode.LOOP,
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
        revisionNumber: 3,
      },
      deletedAt: null,
      description: 'Morning commute',
      name: 'River ride',
    },
    routeId: 'route-1',
    routeRevision: null,
    routeRevisionId: null,
    token: 'share-token-1',
    updatedAt: new Date('2026-05-13T10:00:00.000Z'),
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
    createdAt: new Date('2026-05-13T10:00:00.000Z'),
    currentRevision: {
      createdAt: new Date('2026-05-13T10:00:00.000Z'),
      createdBy: 'user-2',
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
    isPublic: false,
    libraryItem: {
      createdAt: new Date('2026-05-13T10:00:00.000Z'),
      deletedAt: null,
      id: input.libraryItemId,
      kind: LibraryItemKind.ROUTE,
      lastUsedAt: null,
      pinned: false,
      placeId: null,
      routeId: input.id,
      sortOrder: 5,
      updatedAt: new Date('2026-05-13T10:00:00.000Z'),
      version: 1,
    },
    mode: input.mode,
    name: 'River ride',
    updatedAt: new Date('2026-05-13T10:00:00.000Z'),
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
