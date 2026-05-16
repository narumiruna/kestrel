import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import {
  LibraryItemKind,
  RouteMode,
  Prisma,
  SyncEntityType,
  SyncOperation,
} from '@prisma/client';
import {
  mapPlace,
  mapRoute,
  mapRouteRevision,
  placeSelect,
  routeRevisionSelect,
  routeSelect,
} from '../library/library.models';
import { PrismaService } from '../prisma/prisma.service';
import {
  mapPublicShareLink,
  mapShareLink,
  shareLinkSelect,
} from './sharing.models';
import {
  parseCopySharedItemInput,
  parseShareLinkUpdateInput,
} from './sharing.validation';

const publicPlaceSelect = {
  deletedAt: true,
  description: true,
  latitude: true,
  longitude: true,
  name: true,
  tags: true,
} satisfies Prisma.PlaceSelect;

type SharedRouteRevision = {
  createdAt: Date;
  defaultSpeedKmh: number;
  id: string;
  mode: RouteMode;
  revisionNumber: number;
  waypoints: Array<{
    latitude: number;
    longitude: number;
    pauseSeconds: number | null;
    sequence: number;
    speedKmh: number | null;
  }>;
};

type ShareLinkLookup = Prisma.ShareLinkGetPayload<{
  select: typeof shareLinkSelect;
}>;

type PublicPlaceRecord = Prisma.PlaceGetPayload<{
  select: typeof publicPlaceSelect;
}>;

type PublicShareRecord = Prisma.ShareLinkGetPayload<{
  select: {
    createdAt: true;
    disabledAt: true;
    expiresAt: true;
    id: true;
    permission: true;
    place: {
      select: typeof publicPlaceSelect;
    };
    placeId: true;
    route: {
      select: {
        deletedAt: true;
        description: true;
        name: true;
        currentRevision: {
          select: typeof routeRevisionSelect;
        };
      };
    };
    routeId: true;
    routeRevision: {
      select: typeof routeRevisionSelect;
    };
    routeRevisionId: true;
    token: true;
    updatedAt: true;
  };
}>;

@Injectable()
export class SharingService {
  constructor(private readonly prismaService: PrismaService) {}

  async getPlaceShareLink(userId: string, placeId: string) {
    await this.assertOwnedPlaceExists(userId, placeId);
    const shareLink = await findLatestPlaceShareLink(
      this.prismaService,
      userId,
      placeId,
    );

    if (shareLink == null) {
      throw new NotFoundException('share link not found');
    }

    return mapShareLink(shareLink);
  }

  async createPlaceShareLink(userId: string, placeId: string) {
    await this.assertOwnedPlaceExists(userId, placeId);
    const existingShareLink = await findLatestPlaceShareLink(
      this.prismaService,
      userId,
      placeId,
    );

    if (existingShareLink != null) {
      return mapShareLink(existingShareLink);
    }

    try {
      const shareLink = await this.prismaService.shareLink.create({
        data: {
          ownerId: userId,
          placeId,
          token: createShareToken(),
        },
        select: shareLinkSelect,
      });

      return mapShareLink(shareLink);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        const racedShareLink = await findLatestPlaceShareLink(
          this.prismaService,
          userId,
          placeId,
        );

        if (racedShareLink != null) {
          return mapShareLink(racedShareLink);
        }
      }

      throw error;
    }
  }

  async updatePlaceShareLink(userId: string, placeId: string, input: unknown) {
    await this.assertOwnedPlaceExists(userId, placeId);
    const { disabled } = parseShareLinkUpdateInput(input);
    const existingShareLink = await findLatestPlaceShareLink(
      this.prismaService,
      userId,
      placeId,
    );

    if (existingShareLink == null) {
      throw new NotFoundException('share link not found');
    }

    const updatedShareLink = await this.prismaService.shareLink.update({
      data: {
        disabledAt: disabled ? new Date() : null,
      },
      select: shareLinkSelect,
      where: {
        id: existingShareLink.id,
      },
    });

    return mapShareLink(updatedShareLink);
  }

  async getRouteShareLink(userId: string, routeId: string) {
    await this.assertOwnedRouteExists(userId, routeId);
    const shareLink = await findLatestRouteShareLink(
      this.prismaService,
      userId,
      routeId,
    );

    if (shareLink == null) {
      throw new NotFoundException('share link not found');
    }

    return mapShareLink(shareLink);
  }

  async createRouteShareLink(userId: string, routeId: string) {
    await this.assertOwnedRouteReadyForSharing(userId, routeId);
    const existingShareLink = await findLatestRouteShareLink(
      this.prismaService,
      userId,
      routeId,
    );

    if (existingShareLink != null) {
      return mapShareLink(existingShareLink);
    }

    try {
      const shareLink = await this.prismaService.shareLink.create({
        data: {
          ownerId: userId,
          routeId,
          token: createShareToken(),
        },
        select: shareLinkSelect,
      });

      return mapShareLink(shareLink);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        const racedShareLink = await findLatestRouteShareLink(
          this.prismaService,
          userId,
          routeId,
        );

        if (racedShareLink != null) {
          return mapShareLink(racedShareLink);
        }
      }

      throw error;
    }
  }

  async updateRouteShareLink(userId: string, routeId: string, input: unknown) {
    await this.assertOwnedRouteExists(userId, routeId);
    const { disabled } = parseShareLinkUpdateInput(input);
    const existingShareLink = await findLatestRouteShareLink(
      this.prismaService,
      userId,
      routeId,
    );

    if (existingShareLink == null) {
      throw new NotFoundException('share link not found');
    }

    const updatedShareLink = await this.prismaService.shareLink.update({
      data: {
        disabledAt: disabled ? new Date() : null,
      },
      select: shareLinkSelect,
      where: {
        id: existingShareLink.id,
      },
    });

    return mapShareLink(updatedShareLink);
  }

  async getSharedRoute(token: string) {
    return this.getSharedItem(token);
  }

  async getSharedItem(token: string) {
    const shareLink = await this.getActiveShareLinkByToken(
      this.prismaService,
      token,
    );

    if (shareLink.placeId != null) {
      return {
        kind: LibraryItemKind.PLACE,
        place: sanitizePublicPlace(selectVisiblePlace(shareLink)),
        shareLink: mapPublicShareLink(shareLink),
      };
    }

    const revision = selectVisibleRevision(shareLink);
    const route = selectVisibleRoute(shareLink);

    return {
      kind: LibraryItemKind.ROUTE,
      route: {
        description: route.description,
        name: route.name,
        revision: sanitizePublicRouteRevision(revision),
      },
      shareLink: mapPublicShareLink(shareLink),
    };
  }

  async copySharedRoute(userId: string, token: string, input: unknown) {
    return this.copySharedItem(userId, token, input);
  }

  async copySharedItem(userId: string, token: string, input: unknown) {
    const copyInput = parseCopySharedItemInput(input);

    return this.prismaService.$transaction(async (tx) => {
      const shareLink = await this.getActiveShareLinkByToken(tx, token);

      if (shareLink.placeId != null) {
        return copySharedPlace(tx, userId, shareLink);
      }

      if (copyInput.routeRevisionId == null) {
        throw new BadRequestException(
          'routeRevisionId must be a non-empty string',
        );
      }

      return copySharedRoute(tx, userId, shareLink, copyInput.routeRevisionId);
    });
  }

  private async assertOwnedPlaceExists(userId: string, placeId: string) {
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
  }

  private async assertOwnedRouteExists(userId: string, routeId: string) {
    const route = await this.prismaService.route.findFirst({
      select: {
        id: true,
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
  }

  private async assertOwnedRouteReadyForSharing(
    userId: string,
    routeId: string,
  ) {
    const route = await this.prismaService.route.findFirst({
      select: {
        currentRevisionId: true,
        id: true,
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

    if (route.currentRevisionId == null) {
      throw new InternalServerErrorException(
        'route is missing its current revision',
      );
    }
  }

  private async getActiveShareLinkByToken(
    prisma: PrismaService | Prisma.TransactionClient,
    token: string,
  ) {
    const shareLink = await prisma.shareLink.findUnique({
      select: {
        createdAt: true,
        disabledAt: true,
        expiresAt: true,
        id: true,
        permission: true,
        place: {
          select: publicPlaceSelect,
        },
        placeId: true,
        route: {
          select: {
            deletedAt: true,
            description: true,
            name: true,
            currentRevision: {
              select: routeRevisionSelect,
            },
          },
        },
        routeId: true,
        routeRevision: {
          select: routeRevisionSelect,
        },
        routeRevisionId: true,
        token: true,
        updatedAt: true,
      },
      where: {
        token,
      },
    });

    if (shareLink == null || !isShareLinkActive(shareLink)) {
      throw new NotFoundException('share link not found');
    }

    assertShareLinkTargetIsVisible(shareLink);

    return shareLink;
  }
}

async function copySharedPlace(
  tx: Prisma.TransactionClient,
  userId: string,
  shareLink: PublicShareRecord,
) {
  const sharedPlace = sanitizePublicPlace(selectVisiblePlace(shareLink));
  const sortOrder = await getNextSortOrder(tx, userId);
  const createdPlace = await tx.place.create({
    data: {
      description: sharedPlace.description,
      latitude: sharedPlace.latitude,
      longitude: sharedPlace.longitude,
      name: sharedPlace.name,
      tags: sharedPlace.tags,
      userId,
    },
    select: {
      id: true,
    },
  });
  const libraryItem = await tx.libraryItem.create({
    data: {
      kind: LibraryItemKind.PLACE,
      placeId: createdPlace.id,
      sortOrder,
      userId,
    },
    select: {
      id: true,
    },
  });

  await recordSyncEvent(tx, {
    entityId: createdPlace.id,
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

  const copiedPlace = await tx.place.findUniqueOrThrow({
    select: placeSelect,
    where: {
      id: createdPlace.id,
    },
  });

  return mapPlace(copiedPlace);
}

async function copySharedRoute(
  tx: Prisma.TransactionClient,
  userId: string,
  shareLink: PublicShareRecord,
  routeRevisionId: string,
) {
  const revision = await getRequestedSharedRouteRevision(
    tx,
    shareLink,
    routeRevisionId,
  );
  const route = selectVisibleRoute(shareLink);
  const sortOrder = await getNextSortOrder(tx, userId);
  const createdRoute = await tx.route.create({
    data: {
      defaultSpeedKmh: revision.defaultSpeedKmh,
      description: route.description,
      isPublic: false,
      mode: revision.mode,
      name: route.name,
      userId,
    },
    select: {
      id: true,
    },
  });
  const routeRevision = await tx.routeRevision.create({
    data: {
      createdBy: userId,
      payload: createRouteRevisionPayload(revision),
      revisionNumber: 1,
      routeId: createdRoute.id,
    },
    select: {
      id: true,
    },
  });

  await tx.route.update({
    data: {
      currentRevisionId: routeRevision.id,
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

  const copiedRoute = await tx.route.findUniqueOrThrow({
    select: routeSelect,
    where: {
      id: createdRoute.id,
    },
  });

  return mapRoute(copiedRoute);
}

async function findLatestPlaceShareLink(
  prisma: PrismaService | Prisma.TransactionClient,
  ownerId: string,
  placeId: string,
): Promise<ShareLinkLookup | null> {
  return prisma.shareLink.findFirst({
    orderBy: [{ createdAt: 'desc' }],
    select: shareLinkSelect,
    where: {
      ownerId,
      placeId,
      routeId: null,
      routeRevisionId: null,
    },
  });
}

async function findLatestRouteShareLink(
  prisma: PrismaService | Prisma.TransactionClient,
  ownerId: string,
  routeId: string,
): Promise<ShareLinkLookup | null> {
  return prisma.shareLink.findFirst({
    orderBy: [{ createdAt: 'desc' }],
    select: shareLinkSelect,
    where: {
      ownerId,
      placeId: null,
      routeId,
      routeRevisionId: null,
    },
  });
}

function isShareLinkActive(
  shareLink: Pick<PublicShareRecord, 'disabledAt' | 'expiresAt'>,
) {
  return (
    shareLink.disabledAt == null &&
    (shareLink.expiresAt == null || shareLink.expiresAt > new Date())
  );
}

function assertShareLinkTargetIsVisible(shareLink: PublicShareRecord) {
  if (shareLink.placeId != null) {
    selectVisiblePlace(shareLink);
    return;
  }

  if (shareLink.routeId != null) {
    selectVisibleRoute(shareLink);
    return;
  }

  throw new NotFoundException('share link not found');
}

function selectVisiblePlace(shareLink: PublicShareRecord): PublicPlaceRecord {
  if (shareLink.place == null || shareLink.place.deletedAt != null) {
    throw new NotFoundException('share link not found');
  }

  return shareLink.place;
}

function selectVisibleRoute(
  shareLink: PublicShareRecord,
): NonNullable<PublicShareRecord['route']> {
  if (shareLink.route == null || shareLink.route.deletedAt != null) {
    throw new NotFoundException('share link not found');
  }

  return shareLink.route;
}

function selectVisibleRevision(
  shareLink: PublicShareRecord,
): SharedRouteRevision {
  const route = selectVisibleRoute(shareLink);
  const revision = shareLink.routeRevision ?? route.currentRevision;

  if (revision == null) {
    throw new NotFoundException('share link not found');
  }

  const mappedRevision = mapRouteRevision(revision);

  return {
    createdAt: mappedRevision.createdAt,
    defaultSpeedKmh: mappedRevision.defaultSpeedKmh,
    id: mappedRevision.id,
    mode: mappedRevision.mode,
    revisionNumber: mappedRevision.revisionNumber,
    waypoints: mappedRevision.waypoints,
  };
}

async function getRequestedSharedRouteRevision(
  prisma: Prisma.TransactionClient,
  shareLink: PublicShareRecord,
  routeRevisionId: string,
): Promise<SharedRouteRevision> {
  if (shareLink.routeRevisionId != null) {
    if (shareLink.routeRevisionId !== routeRevisionId) {
      throw new BadRequestException(
        'routeRevisionId does not match the visible shared snapshot',
      );
    }

    return selectVisibleRevision(shareLink);
  }

  if (shareLink.routeId == null) {
    throw new BadRequestException(
      'routeRevisionId does not match the visible shared snapshot',
    );
  }

  const revision = await prisma.routeRevision.findFirst({
    select: routeRevisionSelect,
    where: {
      id: routeRevisionId,
      routeId: shareLink.routeId,
    },
  });

  if (revision == null) {
    throw new BadRequestException(
      'routeRevisionId does not match the visible shared snapshot',
    );
  }

  return selectVisibleRevision({
    ...shareLink,
    routeRevision: revision,
    routeRevisionId: revision.id,
  });
}

function sanitizePublicPlace(place: PublicPlaceRecord) {
  return {
    description: place.description,
    latitude: place.latitude,
    longitude: place.longitude,
    name: place.name,
    tags: parseStoredTags(place.tags),
  };
}

function sanitizePublicRouteRevision(revision: SharedRouteRevision) {
  return {
    createdAt: revision.createdAt,
    defaultSpeedKmh: revision.defaultSpeedKmh,
    id: revision.id,
    mode: revision.mode,
    revisionNumber: revision.revisionNumber,
    waypoints: revision.waypoints.map((waypoint) => ({
      latitude: waypoint.latitude,
      longitude: waypoint.longitude,
      pauseSeconds: waypoint.pauseSeconds,
      sequence: waypoint.sequence,
      speedKmh: waypoint.speedKmh,
    })),
  };
}

function parseStoredTags(tags: Prisma.JsonValue): string[] {
  if (!Array.isArray(tags) || !tags.every((tag) => typeof tag === 'string')) {
    throw new InternalServerErrorException('stored place tags are invalid');
  }

  return tags;
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

function createRouteRevisionPayload(
  input: SharedRouteRevision,
): Prisma.InputJsonObject {
  return {
    defaultSpeedKmh: input.defaultSpeedKmh,
    mode: input.mode,
    waypoints: input.waypoints.map((waypoint) => ({
      latitude: waypoint.latitude,
      longitude: waypoint.longitude,
      pauseSeconds: waypoint.pauseSeconds,
      sequence: waypoint.sequence,
      speedKmh: waypoint.speedKmh,
    })),
  };
}

async function recordSyncEvent(
  prisma: Prisma.TransactionClient,
  input: {
    entityId: string;
    entityType: SyncEntityType;
    operation: SyncOperation;
    payload?: Prisma.InputJsonObject;
    userId: string;
  },
) {
  await prisma.syncEvent.create({
    data: {
      entityId: input.entityId,
      entityType: input.entityType,
      operation: input.operation,
      payload: input.payload,
      userId: input.userId,
    },
  });
}

function createShareToken(): string {
  return randomBytes(18).toString('base64url');
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}
