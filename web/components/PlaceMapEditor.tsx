'use client';

import maplibregl, { type Map as MapLibreMap, type Marker } from 'maplibre-gl';
import { useEffect, useRef } from 'react';
import { createRasterMapStyle } from '@/components/mapStyle';

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
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (containerRef.current == null || mapRef.current != null) {
      return;
    }

    const map = new maplibregl.Map({
      center: [longitude, latitude],
      container: containerRef.current,
      style: createRasterMapStyle(),
      zoom: 14,
    });
    const marker = new maplibregl.Marker({
      color: '#d97644',
      draggable: true,
    })
      .setLngLat([longitude, latitude])
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
  }, [latitude, longitude]);

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

  return <div className={className} ref={containerRef} />;
}

function roundCoord(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
