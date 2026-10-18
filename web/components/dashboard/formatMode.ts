import type { RouteMode } from '@/lib/api';

export function formatMode(mode: RouteMode): string {
  return mode === 'PING_PONG' ? 'Back and forth' : mode === 'LOOP' ? 'Repeat' : 'One way';
}
