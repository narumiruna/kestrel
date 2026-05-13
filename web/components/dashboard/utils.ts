import { ApiError, type RouteMode } from '@/lib/api';

export function parseNumber(value: string, label: string): number {
  const parsedValue = Number(value);

  if (!Number.isFinite(parsedValue)) {
    throw new Error(`${label} must be a finite number`);
  }

  return parsedValue;
}

export function normalizeNullable(value: string): string | null {
  const trimmed = value.trim();

  return trimmed.length === 0 ? null : trimmed;
}

export function formatCoord(value: number): string {
  return value.toFixed(6);
}

export function formatMode(mode: RouteMode): string {
  return mode === 'PING_PONG' ? 'PingPong' : mode[0] + mode.slice(1).toLowerCase();
}

export function formatError(error: unknown): string {
  if (error instanceof ApiError || error instanceof Error) {
    return error.message;
  }

  return 'Unexpected error';
}

export function toAbsolutePublicUrl(publicUrl: string): string {
  return typeof window === 'undefined' ? publicUrl : `${window.location.origin}${publicUrl}`;
}
