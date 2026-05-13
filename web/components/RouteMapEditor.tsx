'use client';

import maplibregl, { type GeoJSONSource, type Map as MapLibreMap, type Marker } from 'maplibre-gl';
import { useEffect, useRef } from 'react';
import { createRasterMapStyle } from '@/components/mapStyle';
import type { RouteWaypoint } from '@/lib/api';

type Props = {
  className?: string;
  focusTarget?: RouteWaypoint | null;
  onChange: (waypoints: RouteWaypoint[]) => void;
  waypoints: RouteWaypoint[];
};

const LINE_SOURCE_ID = 'route-line';
const LINE_LAYER_ID = 'route-line';

export default function RouteMapEditor({
  className = 'map',
  focusTarget = null,
  onChange,
  waypoints,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const onChangeRef = useRef(onChange);
  const waypointsRef = useRef(waypoints);

  useEffect(() => {
    onChangeRef.current = onChange;
    waypointsRef.current = waypoints;
  }, [onChange, waypoints]);

  useEffect(() => {
    if (containerRef.current == null || mapRef.current != null) {
      return;
    }

    const firstWaypoint = waypointsRef.current[0];
    const map = new maplibregl.Map({
      center:
        firstWaypoint == null
          ? [121.5654, 25.033]
          : [firstWaypoint.longitude, firstWaypoint.latitude],
      container: containerRef.current,
      style: createRasterMapStyle(),
      zoom: firstWaypoint == null ? 11 : 14,
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.on('load', () => {
      map.addSource(LINE_SOURCE_ID, {
        data: toLineFeature(waypointsRef.current),
        type: 'geojson',
      });
      map.addLayer({
        id: LINE_LAYER_ID,
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': '#76c945',
          'line-width': 4,
        },
        source: LINE_SOURCE_ID,
        type: 'line',
      });
      syncMarkers(map, markersRef.current, waypointsRef.current, onChangeRef.current);
      fitWaypoints(map, waypointsRef.current);
    });
    map.on('click', (event) => {
      onChangeRef.current([
        ...waypointsRef.current,
        {
          latitude: roundCoord(event.lngLat.lat),
          longitude: roundCoord(event.lngLat.lng),
        },
      ]);
    });

    mapRef.current = map;

    return () => {
      markersRef.current.forEach((marker) => {
        marker.remove();
      });
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;

    if (map == null) {
      return;
    }

    if (map.isStyleLoaded()) {
      updateLine(map, waypoints);
      syncMarkers(map, markersRef.current, waypoints, onChange);
    } else {
      map.once('load', () => {
        updateLine(map, waypoints);
        syncMarkers(map, markersRef.current, waypoints, onChange);
      });
    }
  }, [onChange, waypoints]);

  useEffect(() => {
    const map = mapRef.current;

    if (map == null || focusTarget == null) {
      return;
    }

    map.easeTo({
      center: [focusTarget.longitude, focusTarget.latitude],
      duration: 350,
      zoom: Math.max(map.getZoom(), 14),
    });
  }, [focusTarget]);

  return <div className={className} ref={containerRef} />;
}

function syncMarkers(
  map: MapLibreMap,
  existingMarkers: Marker[],
  waypoints: RouteWaypoint[],
  onChange: (waypoints: RouteWaypoint[]) => void,
) {
  existingMarkers.forEach((marker) => {
    marker.remove();
  });
  existingMarkers.length = 0;

  waypoints.forEach((waypoint, index) => {
    const marker = new maplibregl.Marker({
      color: index === 0 ? '#76c945' : '#f9aecb',
      draggable: true,
    })
      .setLngLat([waypoint.longitude, waypoint.latitude])
      .addTo(map);

    marker.on('dragend', () => {
      const lngLat = marker.getLngLat();
      onChange(
        waypoints.map((currentWaypoint, currentIndex) =>
          currentIndex === index
            ? {
                ...currentWaypoint,
                latitude: roundCoord(lngLat.lat),
                longitude: roundCoord(lngLat.lng),
              }
            : currentWaypoint,
        ),
      );
    });

    existingMarkers.push(marker);
  });
}

function fitWaypoints(map: MapLibreMap, waypoints: RouteWaypoint[]) {
  if (waypoints.length === 0) {
    return;
  }

  if (waypoints.length === 1) {
    map.easeTo({
      center: [waypoints[0].longitude, waypoints[0].latitude],
      duration: 350,
      zoom: Math.max(map.getZoom(), 13),
    });
    return;
  }

  const bounds = waypoints.reduce(
    (currentBounds, waypoint) => currentBounds.extend([waypoint.longitude, waypoint.latitude]),
    new maplibregl.LngLatBounds(
      [waypoints[0].longitude, waypoints[0].latitude],
      [waypoints[0].longitude, waypoints[0].latitude],
    ),
  );

  map.fitBounds(bounds, {
    duration: 350,
    maxZoom: 15,
    padding: 56,
  });
}

function updateLine(map: MapLibreMap, waypoints: RouteWaypoint[]) {
  const source = map.getSource(LINE_SOURCE_ID) as GeoJSONSource | undefined;

  source?.setData(toLineFeature(waypoints));
}

function toLineFeature(waypoints: RouteWaypoint[]): GeoJSON.Feature<GeoJSON.LineString> {
  return {
    geometry: {
      coordinates: waypoints.map((waypoint) => [waypoint.longitude, waypoint.latitude]),
      type: 'LineString',
    },
    properties: {},
    type: 'Feature',
  };
}

function roundCoord(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
