import { ApiError } from '../../lib/api.ts';

export type PlaceCoordinates = { latitude: number; longitude: number };
export type PlaceCoordinateAxis = keyof PlaceCoordinates;

export function isPlaceCoordinateValid(value: number, axis: PlaceCoordinateAxis): boolean {
  const limit = axis === 'latitude' ? 90 : 180;
  return Number.isFinite(value) && value >= -limit && value <= limit;
}

export function arePlaceCoordinatesValid(
  coords: PlaceCoordinates | null | undefined,
): coords is PlaceCoordinates {
  return (
    coords != null &&
    isPlaceCoordinateValid(coords.latitude, 'latitude') &&
    isPlaceCoordinateValid(coords.longitude, 'longitude')
  );
}

function readCoordinate(value: string, axis: PlaceCoordinateAxis): number | null {
  if (value.trim() === '') return null;
  const number = Number(value);
  return isPlaceCoordinateValid(number, axis) ? number : null;
}

// Preview filtering does not change text or report an error while the user types.
export function getPlacePreviewCoordinates(
  latitude: string,
  longitude: string,
): PlaceCoordinates | null {
  const lat = readCoordinate(latitude, 'latitude');
  const lng = readCoordinate(longitude, 'longitude');
  return lat == null || lng == null ? null : { latitude: lat, longitude: lng };
}

export function parsePlaceCoordinate(value: string, axis: PlaceCoordinateAxis): number {
  const number = readCoordinate(value, axis);
  if (number == null) {
    throw new ApiError(
      'Invalid coordinate',
      400,
      axis === 'latitude' ? 'INVALID_LATITUDE' : 'INVALID_LONGITUDE',
    );
  }
  return number;
}
