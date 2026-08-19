import { BadRequestException } from '../http/errors';

export type ShareLinkUpdateInput = {
  disabled: boolean;
};

export type CopySharedItemInput = {
  routeRevisionId?: string;
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

export function parseCopySharedItemInput(input: unknown): CopySharedItemInput {
  if (input == null) {
    return {};
  }

  if (typeof input !== 'object' || Array.isArray(input)) {
    throw new BadRequestException('request body must be an object');
  }

  const routeRevisionId = (input as Record<string, unknown>).routeRevisionId;

  if (routeRevisionId == null) {
    return {};
  }

  if (typeof routeRevisionId !== 'string' || routeRevisionId.length === 0) {
    throw new BadRequestException('routeRevisionId must be a non-empty string');
  }

  return {
    routeRevisionId,
  };
}
