'use client';

import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';
import { MagnifyingGlassIcon, PlusIcon, SewingPinIcon } from '@/components/ui/icons';
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
  const t = useTranslations('FavoriteWaypointPicker');
  const locale = useLocale();
  const [query, setQuery] = useState('');
  const [copiedPlaceId, setCopiedPlaceId] = useState<string | null>(null);
  const copiedTimeoutRef = useRef<number | null>(null);
  const filteredPlaces = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase(locale);

    if (normalizedQuery.length === 0) {
      return places;
    }

    return places.filter((place) => {
      const haystack = [place.name, place.description ?? '', ...place.tags]
        .join(' ')
        .toLocaleLowerCase(locale);

      return haystack.includes(normalizedQuery);
    });
  }, [places, query, locale]);

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
        <p className="muted">{t('noSavedPlacesYet')}</p>
        <Link
          href="/dashboard/library/places"
          onClick={(event) => {
            if (onBeforeNavigate?.() === false) {
              event.preventDefault();
            }
          }}
        >
          {t('createASavedPlaceFirst')}
        </Link>
      </div>
    );
  }

  return (
    <section className="favorite-picker stack">
      {showHeading ? (
        <div>
          <h3>{t('addFromSavedPlaces')}</h3>
          <p className="muted">
            {mode === 'start'
              ? t('pickASavedPlaceAsTheFirstWaypointOrClick')
              : t('appendASavedPlaceOrClickTheMapToAdd')}
          </p>
        </div>
      ) : null}
      <label
        htmlFor="radix-field-components-dashboard-favoritewaypointpicker-tsx-1"
        className="favorite-search"
      >
        {t('searchSavedPlaces')}
        <span className="favorite-search-box">
          <MagnifyingGlassIcon />
          <TextInput
            id="radix-field-components-dashboard-favoritewaypointpicker-tsx-1"
            placeholder={t('searchSavedPlaces2')}
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
              <SewingPinIcon className="favorite-place-icon" />
              <strong>{place.name}</strong>
              <Button
                className="favorite-add button-icon-label"
                type="button"
                onClick={() => onSelect(place)}
              >
                <PlusIcon />
                {t('add')}
              </Button>
            </span>
            <Button
              aria-label={t('copyCoordinates', { name: place.name })}
              className="coordinate-copy muted mono"
              type="button"
              onClick={() => void copyFavoriteCoords(place)}
            >
              {formatFavoritePlaceCoords(place)}
              {copiedPlaceId === place.id ? (
                <span className="coordinate-copy-tooltip">{t('copied')}</span>
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
        {filteredPlaces.length === 0 ? <p className="muted">{t('noSavedPlacesMatch')}</p> : null}
      </div>
    </section>
  );
}

function formatFavoritePlaceCoords(place: Place): string {
  return `${place.latitude.toFixed(6)}, ${place.longitude.toFixed(6)}`;
}
