import {
  LibraryItemKind,
  type Prisma,
  SyncEntityType,
  SyncOperation,
} from '@prisma/client';

// Callers own validation, transaction boundaries, and their response snapshots.
export async function createPlaceWithLibraryItem(
  tx: Prisma.TransactionClient,
  userId: string,
  input: {
    description?: string | null;
    latitude: number;
    longitude: number;
    name: string;
    tags: string[];
  },
) {
  const sortOrder = await getNextSortOrder(tx, userId);
  const place = await tx.place.create({
    data: {
      description: input.description,
      latitude: input.latitude,
      longitude: input.longitude,
      name: input.name,
      tags: input.tags,
      userId,
    },
    select: { id: true },
  });
  const libraryItem = await tx.libraryItem.create({
    data: {
      kind: LibraryItemKind.PLACE,
      placeId: place.id,
      sortOrder,
      userId,
    },
    select: { id: true },
  });
  await tx.syncEvent.create({
    data: {
      entityId: place.id,
      entityType: SyncEntityType.PLACE,
      operation: SyncOperation.UPSERT,
      payload: undefined,
      userId,
    },
  });
  await tx.syncEvent.create({
    data: {
      entityId: libraryItem.id,
      entityType: SyncEntityType.LIBRARY_ITEM,
      operation: SyncOperation.UPSERT,
      payload: undefined,
      userId,
    },
  });
  return { placeId: place.id, libraryItemId: libraryItem.id };
}

// Callers prepare the route and revision snapshots; this owns only the initial write order.
export async function createRouteWithLibraryItem(
  tx: Prisma.TransactionClient,
  userId: string,
  routeData: Omit<
    Prisma.RouteUncheckedCreateInput,
    'userId' | 'currentRevisionId'
  >,
  payload: Prisma.InputJsonObject,
) {
  const sortOrder = await getNextSortOrder(tx, userId);
  const route = await tx.route.create({
    data: { ...routeData, userId },
    select: { id: true },
  });
  const revision = await tx.routeRevision.create({
    data: {
      createdBy: userId,
      payload,
      revisionNumber: 1,
      routeId: route.id,
    },
    select: { id: true },
  });
  await tx.route.update({
    data: { currentRevisionId: revision.id },
    where: { id: route.id },
  });
  const libraryItem = await tx.libraryItem.create({
    data: {
      kind: LibraryItemKind.ROUTE,
      routeId: route.id,
      sortOrder,
      userId,
    },
    select: { id: true },
  });
  await tx.syncEvent.create({
    data: {
      entityId: route.id,
      entityType: SyncEntityType.ROUTE,
      operation: SyncOperation.UPSERT,
      payload: undefined,
      userId,
    },
  });
  await tx.syncEvent.create({
    data: {
      entityId: libraryItem.id,
      entityType: SyncEntityType.LIBRARY_ITEM,
      operation: SyncOperation.UPSERT,
      payload: undefined,
      userId,
    },
  });
  return { routeId: route.id, libraryItemId: libraryItem.id };
}

export async function getNextSortOrder(
  prisma: Prisma.TransactionClient,
  userId: string,
): Promise<number> {
  const latestItem = await prisma.libraryItem.findFirst({
    orderBy: [{ sortOrder: 'desc' }],
    select: { sortOrder: true },
    where: { deletedAt: null, userId },
  });
  return latestItem == null ? 0 : latestItem.sortOrder + 1;
}
