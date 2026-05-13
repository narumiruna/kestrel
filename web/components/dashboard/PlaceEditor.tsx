'use client';

import dynamic from 'next/dynamic';
import { type FormEvent, useMemo, useState } from 'react';
import { formatError, normalizeNullable, parseNumber } from '@/components/dashboard/utils';
import { DEFAULT_MAP_CENTER } from '@/components/mapStyle';
import type { Place, PlaceInput } from '@/lib/api';

const PlaceMapEditor = dynamic(() => import('@/components/PlaceMapEditor'), {
  ssr: false,
});

export default function PlaceEditor({
  draftCoords,
  onDelete,
  onSave,
  place,
}: {
  draftCoords?: { latitude: number; longitude: number };
  onDelete?: () => void;
  onSave: (input: PlaceInput) => void;
  place: Place | null;
}) {
  const [name, setName] = useState(place?.name ?? '');
  const [latitude, setLatitude] = useState(
    place?.latitude.toString() ?? `${draftCoords?.latitude ?? DEFAULT_MAP_CENTER.latitude}`,
  );
  const [longitude, setLongitude] = useState(
    place?.longitude.toString() ?? `${draftCoords?.longitude ?? DEFAULT_MAP_CENTER.longitude}`,
  );
  const [description, setDescription] = useState(place?.description ?? '');
  const [tags, setTags] = useState(place?.tags.join(', ') ?? '');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const mapCoords = useMemo(
    () => ({
      latitude: parseCoordinateOrFallback(
        latitude,
        place?.latitude ?? draftCoords?.latitude ?? DEFAULT_MAP_CENTER.latitude,
      ),
      longitude: parseCoordinateOrFallback(
        longitude,
        place?.longitude ?? draftCoords?.longitude ?? DEFAULT_MAP_CENTER.longitude,
      ),
    }),
    [draftCoords, latitude, longitude, place],
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSaving(true);

    try {
      await onSave({
        description: normalizeNullable(description),
        latitude: parseNumber(latitude, 'latitude'),
        longitude: parseNumber(longitude, 'longitude'),
        name,
        tags: tags
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean),
      });
    } catch (nextError) {
      setError(formatError(nextError));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form className="panel stack" onSubmit={submit}>
      <h2>{place == null ? 'New place' : 'Edit place'}</h2>
      {error == null ? null : <div className="error">{error}</div>}
      <PlaceMapEditor
        latitude={mapCoords.latitude}
        longitude={mapCoords.longitude}
        onChange={(coords) => {
          setLatitude(formatCoordinateInput(coords.latitude));
          setLongitude(formatCoordinateInput(coords.longitude));
        }}
      />
      <label>
        Name
        <input required value={name} onChange={(event) => setName(event.target.value)} />
      </label>
      <div className="split">
        <label>
          Latitude
          <input
            required
            inputMode="decimal"
            value={latitude}
            onChange={(event) => setLatitude(event.target.value)}
          />
        </label>
        <label>
          Longitude
          <input
            required
            inputMode="decimal"
            value={longitude}
            onChange={(event) => setLongitude(event.target.value)}
          />
        </label>
      </div>
      <label>
        Tags (comma separated)
        <input value={tags} onChange={(event) => setTags(event.target.value)} />
      </label>
      <label>
        Description
        <textarea value={description} onChange={(event) => setDescription(event.target.value)} />
      </label>
      <div className="row">
        <button disabled={isSaving} type="submit">
          {isSaving ? 'Saving…' : 'Save place'}
        </button>
        {onDelete == null ? null : (
          <button className="danger" disabled={isSaving} type="button" onClick={onDelete}>
            Delete
          </button>
        )}
      </div>
    </form>
  );
}

function parseCoordinateOrFallback(value: string, fallback: number): number {
  const parsedValue = Number(value);

  return Number.isFinite(parsedValue) ? parsedValue : fallback;
}

function formatCoordinateInput(value: number): string {
  return value.toFixed(6);
}
