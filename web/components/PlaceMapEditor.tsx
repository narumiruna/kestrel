'use client';

import maplibregl, { type Map as MapLibreMap, type Marker } from 'maplibre-gl';
import { useEffect, useRef } from 'react';
import { getStyleByName } from '@/components/mapStyle';
import { useMapStyle } from '@/hooks/useMapStyle';

type Props = {
  className?: string;
  latitude: number;
  longitude: number;
  onChange: (coords: { latitude: number; longitude: number }) => void;
};

export default function PlaceMapEditor({
  className = 'map',
  latitude,
  longitude,
  onChange,
}: Props) {
  const { styleName } = useMapStyle();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const onChangeRef = useRef(onChange);
  const initialCoordsRef = useRef({ latitude, longitude });
  const initialStyleNameRef = useRef(styleName);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (containerRef.current == null || mapRef.current != null) {
      return;
    }

    const map = new maplibregl.Map({
      center: [initialCoordsRef.current.longitude, initialCoordsRef.current.latitude],
      container: containerRef.current,
      style: getStyleByName(initialStyleNameRef.current),
      zoom: 14,
    });
    const marker = new maplibregl.Marker({
      draggable: true,
      element: createPlaceMarkerElement({ active: true, label: 'Draft place' }),
    })
      .setLngLat([initialCoordsRef.current.longitude, initialCoordsRef.current.latitude])
      .addTo(map);

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.on('click', (event) => {
      const nextCoords = {
        latitude: roundCoord(event.lngLat.lat),
        longitude: roundCoord(event.lngLat.lng),
      };

      marker.setLngLat([nextCoords.longitude, nextCoords.latitude]);
      onChangeRef.current(nextCoords);
    });
    marker.on('dragend', () => {
      const lngLat = marker.getLngLat();

      onChangeRef.current({
        latitude: roundCoord(lngLat.lat),
        longitude: roundCoord(lngLat.lng),
      });
    });

    mapRef.current = map;
    markerRef.current = marker;

    return () => {
      marker.remove();
      markerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const marker = markerRef.current;

    if (map == null || marker == null) {
      return;
    }

    marker.setLngLat([longitude, latitude]);
    map.easeTo({
      center: [longitude, latitude],
      duration: 250,
      zoom: Math.max(map.getZoom(), 14),
    });
  }, [latitude, longitude]);

  useEffect(() => {
    const map = mapRef.current;

    if (map == null) {
      return;
    }

    const center = map.getCenter();
    const zoom = map.getZoom();
    map.setStyle(getStyleByName(styleName));
    map.once('style.load', () => map.jumpTo({ center, zoom }));
  }, [styleName]);

  return <div className={className} ref={containerRef} />;
}

function createPlaceMarkerElement({ active, label }: { active: boolean; label: string }) {
  const element = document.createElement('button');
  element.ariaLabel = label;
  element.className = `place-marker${active ? ' active' : ''}`;
  element.type = 'button';

  return element;
}

function roundCoord(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
