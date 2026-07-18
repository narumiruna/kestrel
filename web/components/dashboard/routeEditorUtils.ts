import { normalizeNullable } from '@/components/dashboard/utils';
import type { Place, Route, RouteMode, RouteWaypoint } from '@/lib/api';

export function getRouteBaseline(route: Route | null) {
  return {
    defaultSpeedKmh: route?.defaultSpeedKmh.toString() ?? '5',
    description: route?.description ?? '',
    isPublic: route?.isPublic ?? false,
    mode: route?.mode ?? ('ONCE' as RouteMode),
    name: route?.name ?? '',
    waypoints:
      route?.currentRevision?.waypoints.map((waypoint) => ({
        latitude: waypoint.latitude,
        longitude: waypoint.longitude,
      })) ?? [],
  };
}

export function isRouteDraftEqual(
  draft: {
    defaultSpeedKmh: string;
    description: string;
    isPublic: boolean;
    mode: RouteMode;
    name: string;
    waypoints: RouteWaypoint[];
  },
  baseline: ReturnType<typeof getRouteBaseline>,
): boolean {
  return (
    numberInputsEqual(draft.defaultSpeedKmh, baseline.defaultSpeedKmh) &&
    normalizeNullable(draft.description) === normalizeNullable(baseline.description) &&
    draft.isPublic === baseline.isPublic &&
    draft.mode === baseline.mode &&
    draft.name.trim() === baseline.name.trim() &&
    waypointsEqual(draft.waypoints, baseline.waypoints)
  );
}

export function getWaypointKey(waypoint: RouteWaypoint, index: number): string {
  return `${waypoint.sequence ?? index}-${waypoint.latitude}-${waypoint.longitude}`;
}

export function formatWaypointSummary(waypoints: RouteWaypoint[], places: Place[]): string {
  const firstWaypoint = waypoints[0];
  const lastWaypoint = waypoints.at(-1);

  if (firstWaypoint == null || lastWaypoint == null) {
    return 'Start by adding a point';
  }

  if (waypoints.length === 1) {
    return 'Add one more waypoint to save';
  }

  return `${formatWaypointName(firstWaypoint, places, 'Pin 1')} → ${formatWaypointName(
    lastWaypoint,
    places,
    `Pin ${waypoints.length}`,
  )}`;
}

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

export function getRouteBuilderHint(
  waypointCount: number,
  placeCount: number,
  mapMode: 'background' | 'embedded',
): string {
  if (mapMode === 'background' && waypointCount >= 2) {
    return 'Straight segments connect waypoints · Drag pins to adjust';
  }

  if (waypointCount === 0) {
    return placeCount === 0
      ? 'Start by clicking the map to add your first waypoint.'
      : 'Choose a saved place as the start, or click the map to add your first waypoint.';
  }

  if (waypointCount === 1) {
    return 'Add at least one more waypoint to save this route.';
  }

  return 'Click the map to add a waypoint, or drag any pin to nudge the path.';
}

export function getSaveDisabledReason(waypointCount: number): string | null {
  if (waypointCount === 0) {
    return 'Add at least 2 waypoints before saving.';
  }

  if (waypointCount === 1) {
    return 'Add 1 more waypoint before saving.';
  }

  return null;
}

export function moveWaypoint(
  waypoints: RouteWaypoint[],
  setWaypoints: (waypoints: RouteWaypoint[]) => void,
  fromIndex: number,
  toIndex: number,
) {
  const nextWaypoints = [...waypoints];
  const [waypoint] = nextWaypoints.splice(fromIndex, 1);
  nextWaypoints.splice(toIndex, 0, waypoint);
  setWaypoints(nextWaypoints);
}

function numberInputsEqual(left: string, right: string): boolean {
  const leftNumber = Number(left);
  const rightNumber = Number(right);

  return Number.isFinite(leftNumber) && Number.isFinite(rightNumber) && leftNumber === rightNumber;
}

function waypointsEqual(left: RouteWaypoint[], right: RouteWaypoint[]): boolean {
  return (
    left.length === right.length &&
    left.every(
      (waypoint, index) =>
        waypoint.latitude === right[index]?.latitude &&
        waypoint.longitude === right[index]?.longitude,
    )
  );
}
