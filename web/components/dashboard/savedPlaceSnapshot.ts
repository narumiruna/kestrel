import type { Place, RemotePoint } from '../../lib/api.ts';
import { formatCoord } from './utils.ts';

type SavedPlace = Pick<Place, 'name' | 'latitude' | 'longitude'>;

export type SavedPlaceSnapshot = {
  coordinates: string;
  name: string;
  point: RemotePoint;
};

export function getSavedPlaceSnapshot(place: SavedPlace | null): SavedPlaceSnapshot | null {
  if (place == null) return null;
  return {
    coordinates: `${formatCoord(place.latitude)}, ${formatCoord(place.longitude)}`,
    name: place.name,
    point: { latitude: place.latitude, longitude: place.longitude },
  };
}
