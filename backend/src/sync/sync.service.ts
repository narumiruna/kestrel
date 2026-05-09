import { BadRequestException, Injectable } from '@nestjs/common';
import { SyncEntityType, SyncOperation, type Prisma } from '@prisma/client';
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
