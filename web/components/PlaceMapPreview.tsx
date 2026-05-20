'use client';

import maplibregl, { type Map as MapLibreMap, type Marker } from 'maplibre-gl';
import { useEffect, useRef } from 'react';
import { getStyleByName } from '@/components/mapStyle';
import { useMapStyle } from '@/hooks/useMapStyle';

type Props = {
  className?: string;
  latitude: number;
  longitude: number;
};

export default function PlaceMapPreview({ className = 'map-mini', latitude, longitude }: Props) {
  const { styleName } = useMapStyle();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const initialCoordsRef = useRef({ latitude, longitude });
  const initialStyleNameRef = useRef(styleName);

  useEffect(() => {
    if (containerRef.current == null || mapRef.current != null) {
      return;
    }

    const map = new maplibregl.Map({
      center: [initialCoordsRef.current.longitude, initialCoordsRef.current.latitude],
      container: containerRef.current,
      interactive: false,
      style: getStyleByName(initialStyleNameRef.current),
      zoom: 14,
    });
    const marker = new maplibregl.Marker({
      element: createPreviewMarkerElement(),
    })
      .setLngLat([initialCoordsRef.current.longitude, initialCoordsRef.current.latitude])
      .addTo(map);

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
      duration: 0,
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

function createPreviewMarkerElement() {
  const element = document.createElement('span');
  element.className = 'place-marker active preview';

  return element;
}
