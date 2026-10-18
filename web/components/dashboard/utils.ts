import { formatDistance } from '../../i18n/format.ts';
import { ApiError } from '../../lib/api.ts';

export { formatMode } from './formatMode.ts';

type Coordinate = {
  latitude: number;
  longitude: number;
};

export function parseNumber(value: string, label: string): number {
  const parsedValue = Number(value);

  if (!Number.isFinite(parsedValue)) {
    throw new ApiError(
      'Invalid coordinate',
      400,
      label === 'latitude' ? 'INVALID_LATITUDE' : 'INVALID_LONGITUDE',
    );
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

export function formatRouteDistanceFromWaypoints(waypoints: Coordinate[], locale = 'en'): string {
  const distanceKm = waypoints.slice(1).reduce((totalDistance, waypoint, index) => {
    const previousWaypoint = waypoints[index];

    return totalDistance + getDistanceKm(previousWaypoint, waypoint);
  }, 0);

  return formatDistance(distanceKm, locale);
}

function getDistanceKm(from: Coordinate, to: Coordinate): number {
  const earthRadiusKm = 6371;
  const deltaLatitude = toRadians(to.latitude - from.latitude);
  const deltaLongitude = toRadians(to.longitude - from.longitude);
  const fromLatitude = toRadians(from.latitude);
  const toLatitude = toRadians(to.latitude);
  const haversine =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(fromLatitude) * Math.cos(toLatitude) * Math.sin(deltaLongitude / 2) ** 2;

  return 2 * earthRadiusKm * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function toAbsolutePublicUrl(publicUrl: string): string {
  return typeof window === 'undefined' ? publicUrl : `${window.location.origin}${publicUrl}`;
}
