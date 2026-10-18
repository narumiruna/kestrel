import type { Place, Route } from '@/lib/api';

// Search aliases stay stable; translated mode labels can add matches.
export function matchesPlaceSearch(place: Place, normalizedQuery: string, locale = 'en'): boolean {
  return [place.name, place.description ?? '', ...place.tags]
    .join(' ')
    .toLocaleLowerCase(locale)
    .includes(normalizedQuery);
}

export function matchesRouteSearch(
  route: Route,
  normalizedQuery: string,
  locale = 'en',
  modeLabel = '',
): boolean {
  const content = [route.name, route.description ?? '', modeLabel]
    .join(' ')
    .toLocaleLowerCase(locale);
  const aliases = [
    route.mode === 'PING_PONG'
      ? 'pingpong ping-pong back and forth'
      : route.mode === 'ONCE'
        ? 'once one way'
        : 'loop repeat',
    route.mode.replaceAll('_', '-').toLowerCase(),
  ].join(' ');
  // Protocol and existing English aliases must not acquire Turkish dotted/dotless I.
  const aliasQuery = normalizedQuery.replaceAll('ı', 'i').toLowerCase();
  return content.includes(normalizedQuery) || aliases.includes(aliasQuery);
}
