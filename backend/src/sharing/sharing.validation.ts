import { BadRequestException } from '@nestjs/common';

export type ShareLinkUpdateInput = {
  disabled: boolean;
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
