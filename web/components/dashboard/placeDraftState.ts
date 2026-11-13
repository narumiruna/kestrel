import type { Place } from '../../lib/api.ts';
import { arePlaceCoordinatesValid, type PlaceCoordinates } from './placeCoordinates.ts';

export type PlaceDraft = {
  description: string;
  latitude: string;
  longitude: string;
  name: string;
  tags: string;
};

export type PlaceDraftState = {
  placeId: string | null;
  baseline: PlaceDraft;
  draft: PlaceDraft;
};

export function createPlaceDraftState(
  place: Place | null,
  coords: PlaceCoordinates,
): PlaceDraftState {
  const baseline = {
    description: place?.description ?? '',
    latitude: (place?.latitude ?? coords.latitude).toFixed(6),
    longitude: (place?.longitude ?? coords.longitude).toFixed(6),
    name: place?.name ?? '',
    tags: place?.tags.join(', ') ?? '',
  };
  return { placeId: place?.id ?? null, baseline, draft: { ...baseline } };
}

export function isPlaceDraftDirty(state: PlaceDraftState): boolean {
  const { draft, baseline } = state;
  return !(
    draft.description.trim() === baseline.description.trim() &&
    numberInputsEqual(draft.latitude, baseline.latitude) &&
    numberInputsEqual(draft.longitude, baseline.longitude) &&
    draft.name.trim() === baseline.name.trim() &&
    normalizeTags(draft.tags) === normalizeTags(baseline.tags)
  );
}

export function refreshPlaceDraft(state: PlaceDraftState, place: Place | null): PlaceDraftState {
  if (state.placeId === (place?.id ?? null) && (isPlaceDraftDirty(state) || place == null)) {
    return state;
  }
  return createPlaceDraftState(place, {
    latitude: Number(state.baseline.latitude),
    longitude: Number(state.baseline.longitude),
  });
}

export function applyPlaceMapCoordinates(
  state: PlaceDraftState,
  coords: PlaceCoordinates,
): PlaceDraftState {
  if (!arePlaceCoordinatesValid(coords)) return state;
  const latitude = coords.latitude.toFixed(6);
  const longitude = coords.longitude.toFixed(6);
  if (state.draft.latitude === latitude && state.draft.longitude === longitude) return state;
  return { ...state, draft: { ...state.draft, latitude, longitude } };
}

export function discardPlaceDraft(state: PlaceDraftState): PlaceDraftState {
  return { ...state, draft: { ...state.baseline } };
}

export function rebasePlaceDraftAfterSave(
  current: PlaceDraftState,
  submitted: PlaceDraftState,
  saved?: Place,
): PlaceDraftState {
  const baseline = saved == null ? submitted.draft : createPlaceDraftState(saved, saved).baseline;
  const draft = { ...current.draft };
  for (const key of Object.keys(draft) as Array<keyof PlaceDraft>) {
    if (current.draft[key] === submitted.draft[key]) draft[key] = baseline[key];
  }
  return { placeId: saved?.id ?? current.placeId, baseline: { ...baseline }, draft };
}

function numberInputsEqual(left: string, right: string): boolean {
  return (
    left.trim() !== '' &&
    right.trim() !== '' &&
    Number.isFinite(Number(left)) &&
    Number.isFinite(Number(right)) &&
    Number(left) === Number(right)
  );
}

function normalizeTags(value: string): string {
  return value
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)
    .join('\n');
}
