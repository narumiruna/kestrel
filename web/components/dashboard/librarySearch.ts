import type { Place, Route } from '@/lib/api';
import { formatMode } from './formatMode.ts';

// Both saved-item pickers use the same case-insensitive substring fields.
export function matchesPlaceSearch(place: Place, normalizedQuery: string): boolean {
  return [place.name, place.description ?? '', ...place.tags]
    .join(' ')
    .toLowerCase()
    .includes(normalizedQuery);
}

export function matchesRouteSearch(route: Route, normalizedQuery: string): boolean {
  return [route.name, route.description ?? '', formatMode(route.mode)]
    .join(' ')
    .toLowerCase()
    .includes(normalizedQuery);
}
