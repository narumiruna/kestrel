import type { Place, RouteWaypoint } from '@/lib/api';

export function formatWaypointName(
  waypoint: RouteWaypoint,
  places: Place[],
  fallback: string,
): string {
  return (
    places.find(
      (place) =>
        Math.abs(place.latitude - waypoint.latitude) < 0.00001 &&
        Math.abs(place.longitude - waypoint.longitude) < 0.00001,
    )?.name ?? fallback
  );
}

export function getWaypointBadgeClassName(index: number, waypointCount: number): string {
  const positionClass = index === 0 || index === waypointCount - 1 ? 'is-terminal' : 'is-middle';

  return `waypoint-badge ${positionClass}`;
}

export function formatWaypointCoords(waypoint: RouteWaypoint): string {
  return `${waypoint.latitude.toFixed(5)}, ${waypoint.longitude.toFixed(5)}`;
}
