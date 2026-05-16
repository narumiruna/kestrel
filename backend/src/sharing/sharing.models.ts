import { type Prisma } from '@prisma/client';

export const shareLinkSelect = {
  createdAt: true,
  disabledAt: true,
  expiresAt: true,
  id: true,
  permission: true,
  placeId: true,
  routeId: true,
  routeRevisionId: true,
  token: true,
  updatedAt: true,
} satisfies Prisma.ShareLinkSelect;

type ShareLinkRecord = Prisma.ShareLinkGetPayload<{
  select: typeof shareLinkSelect;
}>;

export function mapShareLink(shareLink: ShareLinkRecord) {
  return {
    createdAt: shareLink.createdAt,
    disabledAt: shareLink.disabledAt,
    expiresAt: shareLink.expiresAt,
    id: shareLink.id,
    permission: shareLink.permission,
    placeId: shareLink.placeId,
    publicUrl: `/share/${shareLink.token}`,
    routeId: shareLink.routeId,
    routeRevisionId: shareLink.routeRevisionId,
    token: shareLink.token,
    updatedAt: shareLink.updatedAt,
  };
}

export function mapPublicShareLink(
  shareLink: Pick<
    ShareLinkRecord,
    'createdAt' | 'expiresAt' | 'permission' | 'token'
  >,
) {
  return {
    createdAt: shareLink.createdAt,
    expiresAt: shareLink.expiresAt,
    permission: shareLink.permission,
    publicUrl: `/share/${shareLink.token}`,
    token: shareLink.token,
  };
}
