import type { RouteMode } from '@/lib/api';

export function formatMode(
  mode: RouteMode,
  t: (key: 'once' | 'loop' | 'pingPong') => string,
): string {
  return t(mode === 'PING_PONG' ? 'pingPong' : mode === 'LOOP' ? 'loop' : 'once');
}
