'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, TextInput } from '@/components/ui/radix-ui';
import type { Place } from '@/lib/api';

export function FavoriteWaypointPicker({
  mode,
  onBeforeNavigate,
  onSelect,
  places,
  showHeading = true,
}: {
  mode: 'append' | 'start';
  onBeforeNavigate?: () => boolean;
  onSelect: (place: Place) => void;
  places: Place[];
  showHeading?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [copiedPlaceId, setCopiedPlaceId] = useState<string | null>(null);
  const copiedTimeoutRef = useRef<number | null>(null);
  const filteredPlaces = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (normalizedQuery.length === 0) {
      return places;
    }

    return places.filter((place) => {
      const haystack = [place.name, place.description ?? '', ...place.tags].join(' ').toLowerCase();

      return haystack.includes(normalizedQuery);
    });
  }, [places, query]);

  useEffect(
    () => () => {
      if (copiedTimeoutRef.current != null) {
        window.clearTimeout(copiedTimeoutRef.current);
      }
    },
    [],
  );

  async function copyFavoriteCoords(place: Place) {
    try {
      await navigator.clipboard.writeText(formatFavoritePlaceCoords(place));
      setCopiedPlaceId(place.id);
      if (copiedTimeoutRef.current != null) {
        window.clearTimeout(copiedTimeoutRef.current);
      }
      copiedTimeoutRef.current = window.setTimeout(() => {
        setCopiedPlaceId((currentPlaceId) => (currentPlaceId === place.id ? null : currentPlaceId));
        copiedTimeoutRef.current = null;
      }, 1400);
    } catch {
      setCopiedPlaceId(null);
    }
  }

  if (places.length === 0) {
    return (
      <div className="favorite-picker empty-state">
        <p className="muted">No saved places yet.</p>
        <Link
          href="/dashboard/library/places"
          onClick={(event) => {
            if (onBeforeNavigate?.() === false) {
              event.preventDefault();
            }
          }}
        >
          Create a saved place first
        </Link>
      </div>
    );
  }

  return (
    <section className="favorite-picker stack">
      {showHeading ? (
        <div>
          <h3>Add from saved places</h3>
          <p className="muted">
            {mode === 'start'
              ? 'Pick a saved place as the first waypoint, or click the map to start manually.'
              : 'Append a saved place, or click the map to add a custom point.'}
          </p>
        </div>
      ) : null}
      <label
        htmlFor="radix-field-components-dashboard-favoritewaypointpicker-tsx-1"
        className="favorite-search"
      >
        Search saved places
        <span className="favorite-search-box">
          <SearchIcon />
          <TextInput
            id="radix-field-components-dashboard-favoritewaypointpicker-tsx-1"
            placeholder="Search saved places..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <kbd>⌘K</kbd>
        </span>
      </label>
      <div className="favorite-place-list">
        {filteredPlaces.map((place) => (
          <div className="favorite-place-option" key={place.id}>
            <span className="favorite-place-main">
              <MapPinIcon />
              <strong>{place.name}</strong>
              <Button
                className="favorite-add button-icon-label"
                type="button"
                onClick={() => onSelect(place)}
              >
                <PlusIcon />
                Add
              </Button>
            </span>
            <Button
              aria-label={`Copy coordinates for ${place.name}`}
              className="coordinate-copy muted mono"
              type="button"
              onClick={() => void copyFavoriteCoords(place)}
            >
              {formatFavoritePlaceCoords(place)}
              {copiedPlaceId === place.id ? (
                <span className="coordinate-copy-tooltip">copied</span>
              ) : null}
            </Button>
            {place.tags.length === 0 ? null : (
              <span className="chip-row">
                {place.tags.map((tag) => (
                  <span className="chip" key={tag}>
                    {tag}
                  </span>
                ))}
              </span>
            )}
          </div>
        ))}
        {filteredPlaces.length === 0 ? <p className="muted">No saved places match.</p> : null}
      </div>
    </section>
  );
}

function formatFavoritePlaceCoords(place: Place): string {
  return `${place.latitude.toFixed(6)}, ${place.longitude.toFixed(6)}`;
}

function SearchIcon() {
  return (
    <svg aria-hidden="true" className="lucide-icon" fill="none" viewBox="0 0 24 24">
      <path d="m21 21-4.3-4.3" />
      <circle cx="11" cy="11" r="8" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg aria-hidden="true" className="lucide-icon" fill="none" viewBox="0 0 24 24">
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

function MapPinIcon() {
  return (
    <svg
      aria-hidden="true"
      className="lucide-icon favorite-place-icon"
      fill="none"
      viewBox="0 0 24 24"
    >
      <path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}
