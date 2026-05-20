'use client';

import maplibregl, { type Map as MapLibreMap, type Marker } from 'maplibre-gl';
import { type MutableRefObject, useEffect, useRef } from 'react';
import { DEFAULT_MAP_CENTER, getStyleByName } from '@/components/mapStyle';
import { useMapStyle } from '@/hooks/useMapStyle';
import type { Place } from '@/lib/api';

export type PlaceViewportControls = {
  fit: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
};

type Props = {
  className?: string;
  draftCoords: { latitude: number; longitude: number } | null;
  onChangeDraftCoords: (coords: { latitude: number; longitude: number }) => void;
  onReady?: (controls: PlaceViewportControls) => void;
  onSelectPlace: (placeId: string) => void;
  places: Place[];
  selectedPlaceId: string | null;
};

export default function CartographerPlaceMap({
  className = 'cartographer-map',
  draftCoords,
  onChangeDraftCoords,
  onReady,
  onSelectPlace,
  places,
  selectedPlaceId,
}: Props) {
  const { styleName } = useMapStyle();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const draftMarkerRef = useRef<Marker | null>(null);
  const stateRef = useRef({ draftCoords, places, selectedPlaceId });
  const callbacksRef = useRef({ onChangeDraftCoords, onReady, onSelectPlace });
  const initialStateRef = useRef({ draftCoords, places, styleName });

  useEffect(() => {
    stateRef.current = { draftCoords, places, selectedPlaceId };
  }, [draftCoords, places, selectedPlaceId]);

  useEffect(() => {
    callbacksRef.current = { onChangeDraftCoords, onReady, onSelectPlace };
  }, [onChangeDraftCoords, onReady, onSelectPlace]);

  useEffect(() => {
    if (containerRef.current == null || mapRef.current != null) {
      return;
    }

    const initialCenter =
      initialStateRef.current.draftCoords ??
      initialStateRef.current.places[0] ??
      DEFAULT_MAP_CENTER;
    const map = new maplibregl.Map({
      center: [initialCenter.longitude, initialCenter.latitude],
      container: containerRef.current,
      style: getStyleByName(initialStateRef.current.styleName),
      zoom: initialStateRef.current.places.length === 0 ? 11 : 13,
    });

    map.on('load', () => {
      syncPlaceMarkers({
        draftCoords: stateRef.current.draftCoords,
        draftMarkerRef,
        markersRef: markersRef.current,
        map,
        onChangeDraftCoords: callbacksRef.current.onChangeDraftCoords,
        onSelectPlace: callbacksRef.current.onSelectPlace,
        places: stateRef.current.places,
        selectedPlaceId: stateRef.current.selectedPlaceId,
      });
      callbacksRef.current.onReady?.({
        fit: () => fitPlaces(map, stateRef.current.places, stateRef.current.draftCoords),
        zoomIn: () => map.zoomIn({ duration: 180 }),
        zoomOut: () => map.zoomOut({ duration: 180 }),
      });
      fitPlaces(map, stateRef.current.places, stateRef.current.draftCoords);
    });

    map.on('click', (event) => {
      const nextCoords = {
        latitude: roundCoord(event.lngLat.lat),
        longitude: roundCoord(event.lngLat.lng),
      };
      callbacksRef.current.onChangeDraftCoords(nextCoords);
    });

    mapRef.current = map;

    return () => {
      markersRef.current.forEach((marker) => {
        marker.remove();
      });
      markersRef.current = [];
      draftMarkerRef.current?.remove();
      draftMarkerRef.current = null;
      callbacksRef.current.onReady?.(createEmptyViewportControls());
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;

    if (map == null) {
      return;
    }

    syncPlaceMarkers({
      draftCoords,
      draftMarkerRef,
      markersRef: markersRef.current,
      map,
      onChangeDraftCoords,
      onSelectPlace,
      places,
      selectedPlaceId,
    });
  }, [draftCoords, onChangeDraftCoords, onSelectPlace, places, selectedPlaceId]);

  useEffect(() => {
    const map = mapRef.current;

    if (map == null) {
      return;
    }

    const center = map.getCenter();
    const zoom = map.getZoom();
    const bearing = map.getBearing();
    const pitch = map.getPitch();

    map.setStyle(getStyleByName(styleName));
    map.once('style.load', () => {
      syncPlaceMarkers({
        draftCoords: stateRef.current.draftCoords,
        draftMarkerRef,
        markersRef: markersRef.current,
        map,
        onChangeDraftCoords: callbacksRef.current.onChangeDraftCoords,
        onSelectPlace: callbacksRef.current.onSelectPlace,
        places: stateRef.current.places,
        selectedPlaceId: stateRef.current.selectedPlaceId,
      });
      map.jumpTo({ bearing, center, pitch, zoom });
    });
  }, [styleName]);

  return <div className={className} ref={containerRef} />;
}

function syncPlaceMarkers({
  draftCoords,
  draftMarkerRef,
  markersRef,
  map,
  onChangeDraftCoords,
  onSelectPlace,
  places,
  selectedPlaceId,
}: {
  draftCoords: { latitude: number; longitude: number } | null;
  draftMarkerRef: MutableRefObject<Marker | null>;
  markersRef: Marker[];
  map: MapLibreMap;
  onChangeDraftCoords: (coords: { latitude: number; longitude: number }) => void;
  onSelectPlace: (placeId: string) => void;
  places: Place[];
  selectedPlaceId: string | null;
}) {
  markersRef.forEach((marker) => {
    marker.remove();
  });
  markersRef.length = 0;

  places.forEach((place) => {
    const isActive = place.id === selectedPlaceId;
    const marker = new maplibregl.Marker({
      element: createPlaceMarkerElement({ active: isActive, label: place.name }),
    })
      .setLngLat([place.longitude, place.latitude])
      .addTo(map);

    marker.getElement().addEventListener('click', (event) => {
      event.stopPropagation();
      onSelectPlace(place.id);
    });
    markersRef.push(marker);
  });

  if (draftCoords == null) {
    draftMarkerRef.current?.remove();
    draftMarkerRef.current = null;
    return;
  }

  if (draftMarkerRef.current == null) {
    draftMarkerRef.current = new maplibregl.Marker({
      draggable: true,
      element: createPlaceMarkerElement({ active: true, label: 'Draft coordinates' }),
    })
      .setLngLat([draftCoords.longitude, draftCoords.latitude])
      .addTo(map);
    draftMarkerRef.current.on('dragend', () => {
      const lngLat = draftMarkerRef.current?.getLngLat();

      if (lngLat == null) {
        return;
      }

      onChangeDraftCoords({
        latitude: roundCoord(lngLat.lat),
        longitude: roundCoord(lngLat.lng),
      });
    });
  }

  draftMarkerRef.current.setLngLat([draftCoords.longitude, draftCoords.latitude]);
}

function createPlaceMarkerElement({ active, label }: { active: boolean; label: string }) {
  const element = document.createElement('button');
  element.ariaLabel = label;
  element.className = `place-marker${active ? ' active' : ''}`;
  element.type = 'button';

  return element;
}

function fitPlaces(
  map: MapLibreMap,
  places: Place[],
  draftCoords: { latitude: number; longitude: number } | null,
) {
  const points = [
    ...places.map((place) => ({ latitude: place.latitude, longitude: place.longitude })),
    ...(draftCoords == null ? [] : [draftCoords]),
  ];

  if (points.length === 0) {
    map.easeTo({
      center: [DEFAULT_MAP_CENTER.longitude, DEFAULT_MAP_CENTER.latitude],
      duration: 250,
      zoom: 11,
    });
    return;
  }

  if (points.length === 1) {
    map.easeTo({
      center: [points[0].longitude, points[0].latitude],
      duration: 250,
      zoom: Math.max(map.getZoom(), 13),
    });
    return;
  }

  const bounds = points.reduce(
    (currentBounds, point) => currentBounds.extend([point.longitude, point.latitude]),
    new maplibregl.LngLatBounds(
      [points[0].longitude, points[0].latitude],
      [points[0].longitude, points[0].latitude],
    ),
  );

  map.fitBounds(bounds, {
    duration: 250,
    maxZoom: 14,
    padding: 92,
  });
}

function createEmptyViewportControls(): PlaceViewportControls {
  return {
    fit: () => undefined,
    zoomIn: () => undefined,
    zoomOut: () => undefined,
  };
}

function roundCoord(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
