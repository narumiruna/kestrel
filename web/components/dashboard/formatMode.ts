import type { RouteMode } from '@/lib/api';

export function formatMode(mode: RouteMode): string {
  return mode === 'PING_PONG' ? 'Ping-pong' : mode[0] + mode.slice(1).toLowerCase();
}
