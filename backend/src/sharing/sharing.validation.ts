import { BadRequestException } from '@nestjs/common';

export type ShareLinkUpdateInput = {
  disabled: boolean;
};

export type CopySharedRouteInput = {
  routeRevisionId: string;
};

export function parseShareLinkUpdateInput(
  input: unknown,
): ShareLinkUpdateInput {
  if (input == null || typeof input !== 'object' || Array.isArray(input)) {
    throw new BadRequestException('request body must be an object');
  }

  const disabled = (input as Record<string, unknown>).disabled;

  if (typeof disabled !== 'boolean') {
    throw new BadRequestException('disabled must be a boolean');
  }

  return {
    disabled,
  };
}

export function parseCopySharedRouteInput(
  input: unknown,
): CopySharedRouteInput {
  if (input == null || typeof input !== 'object' || Array.isArray(input)) {
    throw new BadRequestException('request body must be an object');
  }

  const routeRevisionId = (input as Record<string, unknown>).routeRevisionId;

  if (typeof routeRevisionId !== 'string' || routeRevisionId.length === 0) {
    throw new BadRequestException('routeRevisionId must be a non-empty string');
  }

  return {
    routeRevisionId,
  };
}
