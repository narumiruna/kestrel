import { argon2id, hash } from 'argon2';
import {
  LibraryItemKind,
  PrismaClient,
  RouteMode,
  type Prisma,
} from '@prisma/client';

const DEV_ADMIN_PASSWORD = 'admin';
const DEV_ADMIN_USERNAME = 'admin';

const SAMPLE_PLACES = [
  {
    description: 'Useful map-debug landmark near Taipei 101.',
    latitude: 25.033976,
    longitude: 121.564538,
    name: 'Taipei 101',
    tags: ['debug', 'landmark'],
  },
  {
    description: 'Transit hub for route editor smoke tests.',
    latitude: 25.047924,
    longitude: 121.517081,
    name: 'Taipei Main Station',
    tags: ['debug', 'station'],
  },
  {
    description: 'Open space for visual map checks.',
    latitude: 25.03752,
    longitude: 121.56368,
    name: 'Sun Yat-sen Memorial Hall',
    tags: ['debug', 'park'],
  },
];

const SAMPLE_ROUTES = [
  {
    defaultSpeedKmh: 5,
    description: 'Compact downtown route for marker and label checks.',
    mode: RouteMode.ONCE,
    name: 'Debug downtown loop',
    waypoints: [
      { latitude: 25.033976, longitude: 121.564538 },
      { latitude: 25.0351, longitude: 121.5662 },
      { latitude: 25.0364, longitude: 121.5653 },
      { latitude: 25.03752, longitude: 121.56368 },
      { latitude: 25.0362, longitude: 121.5621 },
      { latitude: 25.0347, longitude: 121.5628 },
      { latitude: 25.033976, longitude: 121.564538 },
    ],
  },
  {
    defaultSpeedKmh: 12,
    description: 'Longer route with enough points to trigger compact labels.',
    mode: RouteMode.LOOP,
    name: 'Debug riverside route',
    waypoints: [
      { latitude: 25.047924, longitude: 121.517081 },
      { latitude: 25.0483, longitude: 121.5202 },
      { latitude: 25.0491, longitude: 121.5233 },
      { latitude: 25.0502, longitude: 121.5265 },
      { latitude: 25.0514, longitude: 121.5294 },
      { latitude: 25.0526, longitude: 121.5321 },
      { latitude: 25.0538, longitude: 121.535 },
      { latitude: 25.055, longitude: 121.5382 },
      { latitude: 25.0558, longitude: 121.5411 },
      { latitude: 25.0563, longitude: 121.544 },
      { latitude: 25.0552, longitude: 121.5461 },
      { latitude: 25.0539, longitude: 121.5444 },
    ],
  },
];

export function buildSeedRoutePayload(route: (typeof SAMPLE_ROUTES)[number]) {
  return {
    defaultSpeedKmh: route.defaultSpeedKmh,
    mode: route.mode,
    waypoints: route.waypoints.map((waypoint, sequence) => ({
      latitude: waypoint.latitude,
      longitude: waypoint.longitude,
      pauseSeconds: null,
      sequence,
      speedKmh: null,
    })),
  };
}

export async function seedDevData(prisma = new PrismaClient()) {
  if (!isDevSeedEnabled()) {
    return;
  }

  const passwordHash = await hash(DEV_ADMIN_PASSWORD, { type: argon2id });

  await prisma.$transaction(async (transaction) => {
    const user = await transaction.user.upsert({
      create: {
        passwordHash,
        username: DEV_ADMIN_USERNAME,
      },
      select: {
        id: true,
      },
      update: {
        passwordHash,
        totpEnabledAt: null,
        totpSecretEncrypted: null,
      },
      where: {
        username: DEV_ADMIN_USERNAME,
      },
    });

    let sortOrder = 0;

    for (const place of SAMPLE_PLACES) {
      const savedPlace = await upsertPlace(transaction, user.id, place);
      await transaction.libraryItem.upsert({
        create: {
          kind: LibraryItemKind.PLACE,
          placeId: savedPlace.id,
          sortOrder,
          userId: user.id,
        },
        update: {
          deletedAt: null,
          pinned: false,
          sortOrder,
        },
        where: {
          placeId: savedPlace.id,
        },
      });
      sortOrder += 1;
    }

    for (const route of SAMPLE_ROUTES) {
      const savedRoute = await upsertRoute(transaction, user.id, route);
      await transaction.libraryItem.upsert({
        create: {
          kind: LibraryItemKind.ROUTE,
          routeId: savedRoute.id,
          sortOrder,
          userId: user.id,
        },
        update: {
          deletedAt: null,
          pinned: false,
          sortOrder,
        },
        where: {
          routeId: savedRoute.id,
        },
      });
      sortOrder += 1;
    }
  });
}

async function upsertPlace(
  transaction: Prisma.TransactionClient,
  userId: string,
  place: (typeof SAMPLE_PLACES)[number],
) {
  const existingPlace = await transaction.place.findFirst({
    select: { id: true },
    where: {
      name: place.name,
      userId,
    },
  });

  if (existingPlace == null) {
    return transaction.place.create({
      data: {
        ...place,
        tags: place.tags,
        userId,
      },
      select: { id: true },
    });
  }

  return transaction.place.update({
    data: {
      deletedAt: null,
      description: place.description,
      latitude: place.latitude,
      longitude: place.longitude,
      tags: place.tags,
    },
    select: { id: true },
    where: { id: existingPlace.id },
  });
}

async function upsertRoute(
  transaction: Prisma.TransactionClient,
  userId: string,
  route: (typeof SAMPLE_ROUTES)[number],
) {
  const payload = buildSeedRoutePayload(route);
  const existingRoute = await transaction.route.findFirst({
    select: {
      currentRevisionId: true,
      id: true,
    },
    where: {
      name: route.name,
      userId,
    },
  });

  if (existingRoute == null) {
    const savedRoute = await transaction.route.create({
      data: {
        defaultSpeedKmh: route.defaultSpeedKmh,
        description: route.description,
        isPublic: false,
        mode: route.mode,
        name: route.name,
        userId,
      },
      select: { id: true },
    });
    const revision = await transaction.routeRevision.create({
      data: {
        createdBy: userId,
        payload,
        revisionNumber: 1,
        routeId: savedRoute.id,
      },
      select: { id: true },
    });

    return transaction.route.update({
      data: {
        currentRevisionId: revision.id,
      },
      select: { id: true },
      where: { id: savedRoute.id },
    });
  }

  await transaction.route.update({
    data: {
      defaultSpeedKmh: route.defaultSpeedKmh,
      deletedAt: null,
      description: route.description,
      isPublic: false,
      mode: route.mode,
    },
    where: { id: existingRoute.id },
  });

  if (existingRoute.currentRevisionId == null) {
    const latestRevision = await transaction.routeRevision.findFirst({
      orderBy: { revisionNumber: 'desc' },
      select: { revisionNumber: true },
      where: { routeId: existingRoute.id },
    });
    const revision = await transaction.routeRevision.create({
      data: {
        createdBy: userId,
        payload,
        revisionNumber: (latestRevision?.revisionNumber ?? 0) + 1,
        routeId: existingRoute.id,
      },
      select: { id: true },
    });

    return transaction.route.update({
      data: { currentRevisionId: revision.id },
      select: { id: true },
      where: { id: existingRoute.id },
    });
  }

  await transaction.routeRevision.update({
    data: { payload },
    where: { id: existingRoute.currentRevisionId },
  });

  return existingRoute;
}

function isDevSeedEnabled() {
  return (
    process.env.AUTH_DEV_SEED_ENABLED === 'true' &&
    process.env.NODE_ENV !== 'production'
  );
}

if (require.main === module) {
  const prisma = new PrismaClient();
  seedDevData(prisma)
    .finally(async () => prisma.$disconnect())
    .catch((error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    });
}
