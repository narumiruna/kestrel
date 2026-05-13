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
  mapRoute,
  mapRouteRevision,
  routeRevisionSelect,
  routeSelect,
} from '../library/library.models';
import { PrismaService } from '../prisma/prisma.service';
import { mapShareLink, shareLinkSelect } from './sharing.models';
import {
  parseCopySharedRouteInput,
  parseShareLinkUpdateInput,
} from './sharing.validation';

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

type PublicShareRecord = Prisma.ShareLinkGetPayload<{
  select: {
    createdAt: true;
    disabledAt: true;
    expiresAt: true;
    id: true;
    permission: true;
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

  async getRouteShareLink(userId: string, routeId: string) {
    await this.assertOwnedRouteExists(userId, routeId);
    const shareLink = await findLatestShareLink(
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
    const existingShareLink = await findLatestShareLink(
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
        const racedShareLink = await findLatestShareLink(
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
    const existingShareLink = await findLatestShareLink(
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
    const shareLink = await this.getActiveShareLinkByToken(
      this.prismaService,
      token,
    );
    const revision = selectVisibleRevision(shareLink);

    return {
      route: {
        description: shareLink.route.description,
        name: shareLink.route.name,
        revision: sanitizePublicRouteRevision(revision),
      },
      shareLink: mapShareLink({
        createdAt: shareLink.createdAt,
        disabledAt: shareLink.disabledAt,
        expiresAt: shareLink.expiresAt,
        id: shareLink.id,
        permission: shareLink.permission,
        routeId: shareLink.routeId,
        routeRevisionId: shareLink.routeRevisionId,
        token: shareLink.token,
        updatedAt: shareLink.updatedAt,
      }),
    };
  }

  async copySharedRoute(userId: string, token: string, input: unknown) {
    const { routeRevisionId } = parseCopySharedRouteInput(input);

    return this.prismaService.$transaction(async (tx) => {
      const shareLink = await this.getActiveShareLinkByToken(tx, token);
      const revision = await getRequestedSharedRouteRevision(
        tx,
        shareLink,
        routeRevisionId,
      );
      const sortOrder = await getNextSortOrder(tx, userId);
      const createdRoute = await tx.route.create({
        data: {
          defaultSpeedKmh: revision.defaultSpeedKmh,
          description: shareLink.route.description,
          isPublic: false,
          mode: revision.mode,
          name: shareLink.route.name,
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
    });
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

    if (shareLink.route.deletedAt != null) {
      throw new NotFoundException('share link not found');
    }

    return shareLink;
  }
}

async function findLatestShareLink(
  prisma: PrismaService | Prisma.TransactionClient,
  ownerId: string,
  routeId: string,
): Promise<ShareLinkLookup | null> {
  return prisma.shareLink.findFirst({
    orderBy: [{ createdAt: 'desc' }],
    select: shareLinkSelect,
    where: {
      ownerId,
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

function selectVisibleRevision(
  shareLink: PublicShareRecord,
): SharedRouteRevision {
  const revision = shareLink.routeRevision ?? shareLink.route.currentRevision;

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
