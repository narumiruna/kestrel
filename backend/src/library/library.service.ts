import {
  InternalServerErrorException,
  NotFoundException,
} from '../http/errors';
import { LibraryItemKind, SyncEntityType, SyncOperation } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  libraryItemSelect,
  mapLibraryItem,
  mapPlace,
  mapRoute,
  placeSelect,
  routeRevisionSelect,
  routeSelect,
} from './library.models';
import {
  parseCreatePlaceInput,
  parseCreateRouteInput,
  parseLibraryItemReorderInput,
  parseUpdatePlaceInput,
  parseUpdateRouteInput,
} from './library.validation';
import {
  getNextLibrarySortOrder,
  recordSyncEvent,
} from './library.persistence';
import {
  createRouteRevisionPayload,
  parseStoredRouteRevisionPayload,
} from './route-revision.codec';

export class LibraryService {
  constructor(private readonly prismaService: PrismaService) {}

  async listPlaces(userId: string, includeDeleted = false) {
    const places = await this.prismaService.place.findMany({
      orderBy: [{ createdAt: 'asc' }],
      select: placeSelect,
      where: {
        deletedAt: includeDeleted ? undefined : null,
        userId,
      },
    });

    return places.map((place) => mapPlace(place));
  }

  async getPlace(userId: string, placeId: string, includeDeleted = false) {
    const place = await this.prismaService.place.findFirst({
      select: placeSelect,
      where: {
        deletedAt: includeDeleted ? undefined : null,
        id: placeId,
        userId,
      },
    });

    if (place == null) {
      throw new NotFoundException('place not found');
    }

    return mapPlace(place);
  }

  async createPlace(userId: string, input: unknown) {
    const createInput = parseCreatePlaceInput(input);
    const createdPlace = await this.prismaService.$transaction(async (tx) => {
      const sortOrder = await getNextLibrarySortOrder(tx, userId);
      const place = await tx.place.create({
        data: {
          description: createInput.description,
          latitude: createInput.latitude,
          longitude: createInput.longitude,
          name: createInput.name,
          tags: createInput.tags,
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
      await recordSyncEvent(tx, {
        entityId: place.id,
        entityType: SyncEntityType.PLACE,
        operation: SyncOperation.UPSERT,
        userId,
      });
      await recordSyncEvent(tx, {
        entityId: libraryItem.id,
        entityType: SyncEntityType.LIBRARY_ITEM,
        operation: SyncOperation.UPSERT,
        userId,
      });

      return tx.place.findUniqueOrThrow({
        select: placeSelect,
        where: {
          id: place.id,
        },
      });
    });

    return mapPlace(createdPlace);
  }

  async updatePlace(userId: string, placeId: string, input: unknown) {
    const updateInput = parseUpdatePlaceInput(input);
    const place = await this.prismaService.place.findFirst({
      select: {
        id: true,
      },
      where: {
        deletedAt: null,
        id: placeId,
        userId,
      },
    });

    if (place == null) {
      throw new NotFoundException('place not found');
    }

    await this.prismaService.$transaction(async (tx) => {
      await tx.place.update({
        data: updateInput,
        where: {
          id: place.id,
        },
      });
      await tx.libraryItem.updateMany({
        data: {
          version: {
            increment: 1,
          },
        },
        where: {
          deletedAt: null,
          placeId: place.id,
          userId,
        },
      });
      await recordSyncEvent(tx, {
        entityId: place.id,
        entityType: SyncEntityType.PLACE,
        operation: SyncOperation.UPSERT,
        userId,
      });
    });

    return this.getPlace(userId, place.id);
  }

  async deletePlace(userId: string, placeId: string) {
    return this.prismaService.$transaction(async (tx) => {
      const place = await tx.place.findFirst({
        select: {
          id: true,
          libraryItem: {
            select: {
              id: true,
            },
          },
        },
        where: {
          deletedAt: null,
          id: placeId,
          userId,
        },
      });

      if (place == null) {
        throw new NotFoundException('place not found');
      }

      const deletedAt = new Date();
      await tx.place.update({
        data: {
          deletedAt,
        },
        where: {
          id: place.id,
        },
      });

      if (place.libraryItem != null) {
        await tx.libraryItem.update({
          data: {
            deletedAt,
            version: {
              increment: 1,
            },
          },
          where: {
            id: place.libraryItem.id,
          },
        });
        await recordSyncEvent(tx, {
          entityId: place.libraryItem.id,
          entityType: SyncEntityType.LIBRARY_ITEM,
          operation: SyncOperation.DELETE,
          payload: {
            deletedAt: deletedAt.toISOString(),
          },
          userId,
        });
      }
      await recordSyncEvent(tx, {
        entityId: place.id,
        entityType: SyncEntityType.PLACE,
        operation: SyncOperation.DELETE,
        payload: {
          deletedAt: deletedAt.toISOString(),
        },
        userId,
      });

      return {
        deletedAt,
        id: place.id,
        kind: LibraryItemKind.PLACE,
        libraryItemId: place.libraryItem?.id ?? null,
      };
    });
  }

  async listRoutes(userId: string, includeDeleted = false) {
    const routes = await this.prismaService.route.findMany({
      orderBy: [{ createdAt: 'asc' }],
      select: routeSelect,
      where: {
        deletedAt: includeDeleted ? undefined : null,
        userId,
      },
    });

    return routes.map((route) => mapRoute(route));
  }

  async getRoute(userId: string, routeId: string, includeDeleted = false) {
    const route = await this.prismaService.route.findFirst({
      select: routeSelect,
      where: {
        deletedAt: includeDeleted ? undefined : null,
        id: routeId,
        userId,
      },
    });

    if (route == null) {
      throw new NotFoundException('route not found');
    }

    return mapRoute(route);
  }

  async createRoute(userId: string, input: unknown) {
    const createInput = parseCreateRouteInput(input);
    const route = await this.prismaService.$transaction(async (tx) => {
      const sortOrder = await getNextLibrarySortOrder(tx, userId);
      const createdRoute = await tx.route.create({
        data: {
          defaultSpeedKmh: createInput.defaultSpeedKmh,
          description: createInput.description,
          isPublic: createInput.isPublic,
          mode: createInput.mode,
          name: createInput.name,
          userId,
        },
        select: {
          id: true,
        },
      });
      const revision = await tx.routeRevision.create({
        data: {
          createdBy: userId,
          payload: createRouteRevisionPayload({
            defaultSpeedKmh: createInput.defaultSpeedKmh,
            mode: createInput.mode,
            waypoints: createInput.waypoints,
          }),
          revisionNumber: 1,
          routeId: createdRoute.id,
        },
        select: {
          id: true,
        },
      });

      await tx.route.update({
        data: {
          currentRevisionId: revision.id,
        },
        where: {
          id: createdRoute.id,
        },
      });
      const libraryItem = await tx.libraryItem.create({
        data: {
          kind: LibraryItemKind.ROUTE,
          routeId: createdRoute.id,
          sortOrder,
          userId,
        },
        select: {
          id: true,
        },
      });
      await recordSyncEvent(tx, {
        entityId: createdRoute.id,
        entityType: SyncEntityType.ROUTE,
        operation: SyncOperation.UPSERT,
        userId,
      });
      await recordSyncEvent(tx, {
        entityId: libraryItem.id,
        entityType: SyncEntityType.LIBRARY_ITEM,
        operation: SyncOperation.UPSERT,
        userId,
      });

      return tx.route.findUniqueOrThrow({
        select: routeSelect,
        where: {
          id: createdRoute.id,
        },
      });
    });

    return mapRoute(route);
  }

  async updateRoute(userId: string, routeId: string, input: unknown) {
    const updateInput = parseUpdateRouteInput(input);
    const route = await this.prismaService.$transaction(async (tx) => {
      const existingRoute = await tx.route.findFirst({
        select: {
          currentRevision: {
            select: routeRevisionSelect,
          },
          description: true,
          id: true,
          isPublic: true,
          name: true,
        },
        where: {
          deletedAt: null,
          id: routeId,
          userId,
        },
      });

      if (existingRoute == null) {
        throw new NotFoundException('route not found');
      }

      if (existingRoute.currentRevision == null) {
        throw new InternalServerErrorException(
          'route is missing its current revision',
        );
      }

      const currentPayload = parseStoredRouteRevisionPayload(
        existingRoute.currentRevision.payload,
      );
      const nextSnapshot = {
        defaultSpeedKmh:
          updateInput.defaultSpeedKmh ?? currentPayload.defaultSpeedKmh,
        mode: updateInput.mode ?? currentPayload.mode,
        waypoints:
          updateInput.waypoints ??
          currentPayload.waypoints.map((waypoint) => ({
            latitude: waypoint.latitude,
            longitude: waypoint.longitude,
            pauseSeconds: waypoint.pauseSeconds,
            speedKmh: waypoint.speedKmh,
          })),
      };
      const nextRevision = await tx.routeRevision.create({
        data: {
          createdBy: userId,
          payload: createRouteRevisionPayload(nextSnapshot),
          revisionNumber: existingRoute.currentRevision.revisionNumber + 1,
          routeId: existingRoute.id,
        },
        select: {
          id: true,
        },
      });

      await tx.route.update({
        data: {
          currentRevisionId: nextRevision.id,
          defaultSpeedKmh: nextSnapshot.defaultSpeedKmh,
          description:
            updateInput.description === undefined
              ? existingRoute.description
              : updateInput.description,
          isPublic: updateInput.isPublic ?? existingRoute.isPublic,
          mode: nextSnapshot.mode,
          name: updateInput.name ?? existingRoute.name,
        },
        where: {
          id: existingRoute.id,
        },
      });
      await recordSyncEvent(tx, {
        entityId: existingRoute.id,
        entityType: SyncEntityType.ROUTE,
        operation: SyncOperation.UPSERT,
        userId,
      });

      return tx.route.findUniqueOrThrow({
        select: routeSelect,
        where: {
          id: existingRoute.id,
        },
      });
    });

    return mapRoute(route);
  }

  async deleteRoute(userId: string, routeId: string) {
    return this.prismaService.$transaction(async (tx) => {
      const route = await tx.route.findFirst({
        select: {
          id: true,
          libraryItem: {
            select: {
              id: true,
            },
          },
        },
        where: {
          deletedAt: null,
          id: routeId,
          userId,
        },
      });

      if (route == null) {
        throw new NotFoundException('route not found');
      }

      const deletedAt = new Date();
      await tx.route.update({
        data: {
          deletedAt,
        },
        where: {
          id: route.id,
        },
      });

      if (route.libraryItem != null) {
        await tx.libraryItem.update({
          data: {
            deletedAt,
          },
          where: {
            id: route.libraryItem.id,
          },
        });
        await recordSyncEvent(tx, {
          entityId: route.libraryItem.id,
          entityType: SyncEntityType.LIBRARY_ITEM,
          operation: SyncOperation.DELETE,
          payload: {
            deletedAt: deletedAt.toISOString(),
          },
          userId,
        });
      }
      await recordSyncEvent(tx, {
        entityId: route.id,
        entityType: SyncEntityType.ROUTE,
        operation: SyncOperation.DELETE,
        payload: {
          deletedAt: deletedAt.toISOString(),
        },
        userId,
      });

      return {
        deletedAt,
        id: route.id,
        kind: LibraryItemKind.ROUTE,
        libraryItemId: route.libraryItem?.id ?? null,
      };
    });
  }

  async reorderLibraryItem(userId: string, input: unknown) {
    const { itemId, toIndex } = parseLibraryItemReorderInput(input);

    return this.prismaService.$transaction(async (tx) => {
      const items = await tx.libraryItem.findMany({
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        select: libraryItemSelect,
        where: {
          deletedAt: null,
          userId,
        },
      });
      const currentIndex = items.findIndex((item) => item.id === itemId);

      if (currentIndex === -1) {
        throw new NotFoundException('library item not found');
      }

      const reorderedItems = [...items];
      const [movedItem] = reorderedItems.splice(currentIndex, 1);

      reorderedItems.splice(
        Math.min(toIndex, reorderedItems.length),
        0,
        movedItem,
      );
      await Promise.all(
        reorderedItems.map((item, index) =>
          tx.libraryItem.update({
            data: {
              sortOrder: index,
            },
            where: {
              id: item.id,
            },
          }),
        ),
      );
      await recordSyncEvent(tx, {
        entityId: itemId,
        entityType: SyncEntityType.LIBRARY_ITEM,
        operation: SyncOperation.UPSERT,
        userId,
      });

      return mapLibraryItem(
        await tx.libraryItem.findUniqueOrThrow({
          select: libraryItemSelect,
          where: {
            id: itemId,
          },
        }),
      );
    });
  }

  async touchLibraryItem(userId: string, libraryItemId: string) {
    const existingItem = await this.prismaService.libraryItem.findFirst({
      select: {
        id: true,
      },
      where: {
        deletedAt: null,
        id: libraryItemId,
        userId,
      },
    });

    if (existingItem == null) {
      throw new NotFoundException('library item not found');
    }

    const libraryItem = await this.prismaService.libraryItem.update({
      data: {
        lastUsedAt: new Date(),
      },
      select: libraryItemSelect,
      where: {
        id: existingItem.id,
      },
    });
    await recordSyncEvent(this.prismaService, {
      entityId: existingItem.id,
      entityType: SyncEntityType.LIBRARY_ITEM,
      operation: SyncOperation.UPSERT,
      userId,
    });

    return mapLibraryItem(libraryItem);
  }
}
