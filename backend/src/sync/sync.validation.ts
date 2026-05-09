import { BadRequestException, GoneException } from '@nestjs/common';

export function parseSinceCursorQuery(since: string | undefined): bigint {
  if (since == null) {
    throw new BadRequestException('since is required');
  }

  if (!/^\d+$/.test(since)) {
    throw new BadRequestException(
      'since must be a non-negative integer cursor',
    );
  }

  return BigInt(since);
}

export function throwSyncCursorExpired(): never {
  throw new GoneException({
    code: 'SYNC_CURSOR_EXPIRED',
    message: 'sync cursor expired; run bootstrap again',
  });
}
