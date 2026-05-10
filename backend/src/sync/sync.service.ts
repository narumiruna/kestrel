import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import {
  LibraryItemKind,
  SyncEntityType,
  SyncOperation,
  type Prisma,
} from '@prisma/client';
import {
  libraryItemSelect,
  mapLibraryItem,
  mapPlace,
  mapRoute,
  placeSelect,
  routeSelect,
} from '../library/library.models';
import { PrismaService } from '../prisma/prisma.service';
import { throwSyncCursorExpired } from './sync.validation';

type UploadChange = {
  clientMutationId: string;
  expectedVersion?: number;
  place?: {
    description?: string | null;
    latitude: number;
    longitude: number;
    name: string;
    tags?: string[];
  };
  remoteLibraryItemId?: string;
  remotePlaceId?: string;
  type: 'PLACE_CREATE' | 'PLACE_UPDATE' | 'PLACE_DELETE';
};

type SyncUploadItemResult =
  | {
      clientMutationId: string;
      status: 'uploaded';
      place?: unknown;
      libraryItem?: unknown;
    }
  | {
      clientMutationId: string;
      status: 'conflict';
      cloudPlace?: unknown;
      cloudLibraryItem?: unknown;
      reason: string;
    }
  | { clientMutationId: string; status: 'failed'; message: string };

type SyncUploadResponse = {
  conflicts: SyncUploadItemResult[];
  failed: SyncUploadItemResult[];
  serverTime: string;
  uploaded: SyncUploadItemResult[];
};

type SyncEventRecord = {
  entityId: string;
  entityType: SyncEntityType;
  id: bigint;
  operation: SyncOperation;
  payload: Prisma.JsonValue | null;
};

@Injectable()
export class SyncService {
  constructor(private readonly prismaService: PrismaService) {}

  async bootstrap(userId: string) {
    const [places, routes, libraryItems, latestCursor] = await Promise.all([
      this.prismaService.place.findMany({
        orderBy: [{ createdAt: 'asc' }],
        select: placeSelect,
        where: {
          deletedAt: null,
          userId,
        },
      }),
      this.prismaService.route.findMany({
        orderBy: [{ createdAt: 'asc' }],
        select: routeSelect,
        where: {
          deletedAt: null,
          userId,
        },
      }),
      this.prismaService.libraryItem.findMany({
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        select: libraryItemSelect,
        where: {
          deletedAt: null,
          userId,
        },
      }),
      this.getLatestCursor(userId),
    ]);

    return {
      libraryItems: libraryItems.map((libraryItem) =>
        mapLibraryItem(libraryItem),
      ),
      places: places.map((place) => mapPlace(place)),
      routes: routes.map((route) => mapRoute(route)),
      serverTime: new Date().toISOString(),
      syncCursor: latestCursor.toString(),
    };
  }

  async upload(userId: string, body: unknown): Promise<SyncUploadResponse> {
    const changes = parseUploadChanges(body);
    const uploaded: SyncUploadItemResult[] = [];
    const conflicts: SyncUploadItemResult[] = [];
    const failed: SyncUploadItemResult[] = [];

    for (const change of changes) {
      const result = await this.applyIdempotentUploadChange(userId, change);
      if (result.status === 'uploaded') {
        uploaded.push(result);
      } else if (result.status === 'conflict') {
        conflicts.push(result);
      } else {
        failed.push(result);
      }
    }

    return {
      conflicts,
      failed,
      serverTime: new Date().toISOString(),
      uploaded,
    };
  }

  async getChanges(userId: string, since: bigint) {
    const [latestCursor, oldestCursor] = await Promise.all([
      this.getLatestCursor(userId),
      this.getOldestCursor(userId),
    ]);

    if (since > latestCursor) {
      throw new BadRequestException('since cursor is ahead of server state');
    }

    // A cursor exactly one step before the oldest retained event is still valid:
    // it simply means "return everything we still have from the beginning".
    if (oldestCursor != null && since < oldestCursor - 1n) {
      throwSyncCursorExpired();
    }

    const events = await this.prismaService.syncEvent.findMany({
      orderBy: [{ id: 'asc' }],
      select: {
        entityId: true,
        entityType: true,
        id: true,
        operation: true,
        payload: true,
      },
      where: {
        id: {
          gt: since,
        },
        userId,
      },
    });
    const latestEvents = dedupeSyncEvents(events);
    const libraryItemIds: string[] = [];
    const placeIds: string[] = [];
    const routeIds: string[] = [];
    const deletions = latestEvents
      .filter((event) => event.operation === SyncOperation.DELETE)
      .map((event) => mapDeletion(event));

    latestEvents
      .filter((event) => event.operation === SyncOperation.UPSERT)
      .forEach((event) => {
        if (event.entityType === SyncEntityType.PLACE) {
          placeIds.push(event.entityId);
        }

        if (event.entityType === SyncEntityType.ROUTE) {
          routeIds.push(event.entityId);
        }

        if (event.entityType === SyncEntityType.LIBRARY_ITEM) {
          libraryItemIds.push(event.entityId);
        }
      });

    const [places, routes, libraryItems] = await Promise.all([
      placeIds.length === 0
        ? Promise.resolve([])
        : this.prismaService.place.findMany({
            orderBy: [{ createdAt: 'asc' }],
            select: placeSelect,
            where: {
              deletedAt: null,
              id: {
                in: placeIds,
              },
              userId,
            },
          }),
      routeIds.length === 0
        ? Promise.resolve([])
        : this.prismaService.route.findMany({
            orderBy: [{ createdAt: 'asc' }],
            select: routeSelect,
            where: {
              deletedAt: null,
              id: {
                in: routeIds,
              },
              userId,
            },
          }),
      libraryItemIds.length === 0
        ? Promise.resolve([])
        : this.prismaService.libraryItem.findMany({
            orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
            select: libraryItemSelect,
            where: {
              deletedAt: null,
              id: {
                in: libraryItemIds,
              },
              userId,
            },
          }),
    ]);

    return {
      deletions,
      libraryItems: libraryItems.map((libraryItem) =>
        mapLibraryItem(libraryItem),
      ),
      nextCursor: latestCursor.toString(),
      places: places.map((place) => mapPlace(place)),
      routes: routes.map((route) => mapRoute(route)),
      serverTime: new Date().toISOString(),
    };
  }

  private async applyIdempotentUploadChange(
    userId: string,
    change: UploadChange,
  ): Promise<SyncUploadItemResult> {
    const requestHash = hashUploadChange(change);
    const existing = await this.prismaService.syncUploadMutation.findUnique({
      select: {
        requestHash: true,
        result: true,
      },
      where: {
        userId_clientMutationId: {
          clientMutationId: change.clientMutationId,
          userId,
        },
      },
    });

    if (existing != null) {
      if (existing.requestHash !== requestHash) {
        throw new ConflictException({
          code: 'CLIENT_MUTATION_ID_REUSED',
          message: 'clientMutationId was reused with a different payload',
        });
      }

      return existing.result as SyncUploadItemResult;
    }

    const result = await this.applyUploadChange(userId, change);
    await this.prismaService.syncUploadMutation.create({
      data: {
        clientMutationId: change.clientMutationId,
        requestHash,
        result: JSON.parse(JSON.stringify(result)) as Prisma.InputJsonValue,
        userId,
      },
    });
    return result;
  }

  private async applyUploadChange(
    userId: string,
    change: UploadChange,
  ): Promise<SyncUploadItemResult> {
    try {
      if (change.type === 'PLACE_CREATE') {
        return await this.applyPlaceCreate(userId, change);
      }
      if (change.type === 'PLACE_UPDATE') {
        return await this.applyPlaceUpdate(userId, change);
      }
      return await this.applyPlaceDelete(userId, change);
    } catch (error) {
      return {
        clientMutationId: change.clientMutationId,
        message: error instanceof Error ? error.message : 'upload failed',
        status: 'failed',
      };
    }
  }

  private async applyPlaceCreate(
    userId: string,
    change: UploadChange,
  ): Promise<SyncUploadItemResult> {
    const placeInput = requireUploadPlace(change);
    return this.prismaService.$transaction(async (tx) => {
      const sortOrder = await getNextSortOrder(tx, userId);
      const place = await tx.place.create({
        data: {
          description: placeInput.description,
          latitude: placeInput.latitude,
          longitude: placeInput.longitude,
          name: placeInput.name,
          tags: placeInput.tags ?? [],
          userId,
        },
        select: {
          id: true,
        },
      });
      const libraryItem = await tx.libraryItem.create({
        data: {
          kind: LibraryItemKind.PLACE,
          placeId: place.id,
          sortOrder,
          userId,
        },
        select: {
          id: true,
        },
      });
      await recordSyncEvent(
        tx,
        userId,
        SyncEntityType.PLACE,
        place.id,
        SyncOperation.UPSERT,
      );
      await recordSyncEvent(
        tx,
        userId,
        SyncEntityType.LIBRARY_ITEM,
        libraryItem.id,
        SyncOperation.UPSERT,
      );
      return uploadedResult(
        change.clientMutationId,
        await loadPlaceSnapshot(tx, userId, place.id),
      );
    });
  }

  private async applyPlaceUpdate(
    userId: string,
    change: UploadChange,
  ): Promise<SyncUploadItemResult> {
    const placeInput = requireUploadPlace(change);
    return this.prismaService.$transaction(async (tx) => {
      const snapshot = await loadPlaceSnapshot(
        tx,
        userId,
        requireRemotePlaceId(change),
      );
      if (snapshot == null) {
        throw new BadRequestException('remote place not found');
      }
      if (change.expectedVersion !== snapshot.libraryItem.version) {
        return conflictResult(
          change.clientMutationId,
          snapshot,
          'remote version changed',
        );
      }
      await tx.place.update({
        data: {
          description: placeInput.description,
          latitude: placeInput.latitude,
          longitude: placeInput.longitude,
          name: placeInput.name,
          tags: placeInput.tags ?? [],
        },
        where: {
          id: snapshot.place.id,
        },
      });
      await tx.libraryItem.update({
        data: {
          version: {
            increment: 1,
          },
        },
        where: {
          id: snapshot.libraryItem.id,
        },
      });
      await recordSyncEvent(
        tx,
        userId,
        SyncEntityType.PLACE,
        snapshot.place.id,
        SyncOperation.UPSERT,
      );
      await recordSyncEvent(
        tx,
        userId,
        SyncEntityType.LIBRARY_ITEM,
        snapshot.libraryItem.id,
        SyncOperation.UPSERT,
      );
      return uploadedResult(
        change.clientMutationId,
        await loadPlaceSnapshot(tx, userId, snapshot.place.id),
      );
    });
  }

  private async applyPlaceDelete(
    userId: string,
    change: UploadChange,
  ): Promise<SyncUploadItemResult> {
    return this.prismaService.$transaction(async (tx) => {
      const snapshot = await loadPlaceSnapshot(
        tx,
        userId,
        requireRemotePlaceId(change),
      );
      if (snapshot == null) {
        throw new BadRequestException('remote place not found');
      }
      if (change.expectedVersion !== snapshot.libraryItem.version) {
        return conflictResult(
          change.clientMutationId,
          snapshot,
          'remote version changed',
        );
      }
      const deletedAt = new Date();
      await tx.place.update({
        data: {
          deletedAt,
        },
        where: {
          id: snapshot.place.id,
        },
      });
      await tx.libraryItem.update({
        data: {
          deletedAt,
          version: {
            increment: 1,
          },
        },
        where: {
          id: snapshot.libraryItem.id,
        },
      });
      await recordSyncEvent(
        tx,
        userId,
        SyncEntityType.PLACE,
        snapshot.place.id,
        SyncOperation.DELETE,
        {
          deletedAt: deletedAt.toISOString(),
        },
      );
      await recordSyncEvent(
        tx,
        userId,
        SyncEntityType.LIBRARY_ITEM,
        snapshot.libraryItem.id,
        SyncOperation.DELETE,
        {
          deletedAt: deletedAt.toISOString(),
        },
      );
      return {
        clientMutationId: change.clientMutationId,
        status: 'uploaded',
      };
    });
  }

  private async getLatestCursor(userId: string): Promise<bigint> {
    const latestEvent = await this.prismaService.syncEvent.findFirst({
      orderBy: [{ id: 'desc' }],
      select: {
        id: true,
      },
      where: {
        userId,
      },
    });

    return latestEvent?.id ?? 0n;
  }

  private async getOldestCursor(userId: string): Promise<bigint | null> {
    const oldestEvent = await this.prismaService.syncEvent.findFirst({
      orderBy: [{ id: 'asc' }],
      select: {
        id: true,
      },
      where: {
        userId,
      },
    });

    return oldestEvent?.id ?? null;
  }
}

function dedupeSyncEvents(events: SyncEventRecord[]): SyncEventRecord[] {
  const latestEvents = new Map<string, SyncEventRecord>();

  events.forEach((event) => {
    latestEvents.set(`${event.entityType}:${event.entityId}`, event);
  });

  return [...latestEvents.values()].sort((left, right) =>
    left.id < right.id ? -1 : 1,
  );
}

function parseUploadChanges(body: unknown): UploadChange[] {
  if (body == null || typeof body !== 'object' || Array.isArray(body)) {
    throw new BadRequestException('upload body must be an object');
  }

  const changes = (body as Record<string, unknown>).changes;
  if (!Array.isArray(changes)) {
    throw new BadRequestException('changes must be an array');
  }

  return changes.map((change, index) => parseUploadChange(change, index));
}

function parseUploadChange(change: unknown, index: number): UploadChange {
  if (change == null || typeof change !== 'object' || Array.isArray(change)) {
    throw new BadRequestException(`change ${index} must be an object`);
  }

  const record = change as Record<string, unknown>;
  const clientMutationId = record.clientMutationId;
  const type = record.type;
  const expectedVersion = record.expectedVersion;
  if (typeof clientMutationId !== 'string' || clientMutationId.length === 0) {
    throw new BadRequestException(
      `change ${index} clientMutationId is required`,
    );
  }
  if (
    !['PLACE_CREATE', 'PLACE_UPDATE', 'PLACE_DELETE'].includes(String(type))
  ) {
    throw new BadRequestException(`change ${index} type is invalid`);
  }
  if (expectedVersion !== undefined && !Number.isInteger(expectedVersion)) {
    throw new BadRequestException(`change ${index} expectedVersion is invalid`);
  }

  return {
    clientMutationId,
    expectedVersion: expectedVersion as number | undefined,
    place: parseUploadPlace(record.place, index),
    remoteLibraryItemId:
      typeof record.remoteLibraryItemId === 'string'
        ? record.remoteLibraryItemId
        : undefined,
    remotePlaceId:
      typeof record.remotePlaceId === 'string'
        ? record.remotePlaceId
        : undefined,
    type: type as UploadChange['type'],
  };
}

function parseUploadPlace(
  place: unknown,
  index: number,
): UploadChange['place'] {
  if (place === undefined) {
    return undefined;
  }
  if (place == null || typeof place !== 'object' || Array.isArray(place)) {
    throw new BadRequestException(`change ${index} place must be an object`);
  }
  const record = place as Record<string, unknown>;
  const tags = record.tags;
  if (
    typeof record.name !== 'string' ||
    typeof record.latitude !== 'number' ||
    !Number.isFinite(record.latitude) ||
    typeof record.longitude !== 'number' ||
    !Number.isFinite(record.longitude) ||
    (record.description !== undefined &&
      record.description !== null &&
      typeof record.description !== 'string') ||
    (tags !== undefined &&
      (!Array.isArray(tags) || !tags.every((tag) => typeof tag === 'string')))
  ) {
    throw new BadRequestException(`change ${index} place is invalid`);
  }
  return {
    description: record.description,
    latitude: record.latitude,
    longitude: record.longitude,
    name: record.name,
    tags: tags,
  };
}

function requireUploadPlace(
  change: UploadChange,
): NonNullable<UploadChange['place']> {
  if (change.place == null) {
    throw new BadRequestException('place payload is required');
  }
  return change.place;
}

function requireRemotePlaceId(change: UploadChange): string {
  if (change.remotePlaceId == null) {
    throw new BadRequestException('remotePlaceId is required');
  }
  return change.remotePlaceId;
}

async function getNextSortOrder(
  prisma: Prisma.TransactionClient,
  userId: string,
): Promise<number> {
  const latestItem = await prisma.libraryItem.findFirst({
    orderBy: [{ sortOrder: 'desc' }],
    select: {
      sortOrder: true,
    },
    where: {
      deletedAt: null,
      userId,
    },
  });

  return latestItem == null ? 0 : latestItem.sortOrder + 1;
}

async function loadPlaceSnapshot(
  prisma: Prisma.TransactionClient,
  userId: string,
  placeId: string,
) {
  const place = await prisma.place.findFirst({
    select: placeSelect,
    where: {
      id: placeId,
      userId,
    },
  });
  if (place?.libraryItem == null) {
    return null;
  }
  return {
    libraryItem: mapLibraryItem(place.libraryItem),
    place: mapPlace(place),
  };
}

function uploadedResult(
  clientMutationId: string,
  snapshot: Awaited<ReturnType<typeof loadPlaceSnapshot>>,
): SyncUploadItemResult {
  if (snapshot == null) {
    throw new BadRequestException('uploaded place not found');
  }
  return {
    clientMutationId,
    libraryItem: snapshot.libraryItem,
    place: snapshot.place,
    status: 'uploaded',
  };
}

function conflictResult(
  clientMutationId: string,
  snapshot: NonNullable<Awaited<ReturnType<typeof loadPlaceSnapshot>>>,
  reason: string,
): SyncUploadItemResult {
  return {
    clientMutationId,
    cloudLibraryItem: snapshot.libraryItem,
    cloudPlace: snapshot.place,
    reason,
    status: 'conflict',
  };
}

async function recordSyncEvent(
  prisma: Prisma.TransactionClient,
  userId: string,
  entityType: SyncEntityType,
  entityId: string,
  operation: SyncOperation,
  payload?: Prisma.InputJsonObject,
) {
  await prisma.syncEvent.create({
    data: {
      entityId,
      entityType,
      operation,
      payload,
      userId,
    },
  });
}

function hashUploadChange(change: UploadChange): string {
  return createHash('sha256').update(JSON.stringify(change)).digest('hex');
}

function mapDeletion(event: SyncEventRecord) {
  const payload =
    event.payload != null &&
    typeof event.payload === 'object' &&
    !Array.isArray(event.payload)
      ? (event.payload as Record<string, unknown>)
      : null;

  return {
    deletedAt:
      typeof payload?.deletedAt === 'string' ? payload.deletedAt : null,
    entityId: event.entityId,
    entityType: event.entityType,
  };
}
