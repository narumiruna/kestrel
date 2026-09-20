import { type Prisma, SyncEntityType, SyncOperation } from '@prisma/client';

type LibraryItemStore = Pick<Prisma.TransactionClient, 'libraryItem'>;
type SyncEventStore = Pick<Prisma.TransactionClient, 'syncEvent'>;

export async function getNextLibrarySortOrder(
  prisma: LibraryItemStore,
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

export async function recordSyncEvent(
  prisma: SyncEventStore,
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
