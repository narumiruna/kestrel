'use client';

import maplibregl, { type Map as MapLibreMap, type Marker } from 'maplibre-gl';
import { useEffect, useRef } from 'react';
import { createRasterMapStyle } from '@/components/mapStyle';

type Props = {
  className?: string;
  latitude: number;
  longitude: number;
};

export default function PlaceMapPreview({ className = 'map-mini', latitude, longitude }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<Marker | null>(null);

  useEffect(() => {
    if (containerRef.current == null || mapRef.current != null) {
      return;
    }

    const map = new maplibregl.Map({
      center: [longitude, latitude],
      container: containerRef.current,
      interactive: false,
      style: createRasterMapStyle(),
      zoom: 14,
    });
    const marker = new maplibregl.Marker({
      color: '#d97644',
    })
      .setLngLat([longitude, latitude])
      .addTo(map);

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
      duration: 0,
      zoom: Math.max(map.getZoom(), 14),
    });
  }, [latitude, longitude]);

  return <div className={className} ref={containerRef} />;
}
