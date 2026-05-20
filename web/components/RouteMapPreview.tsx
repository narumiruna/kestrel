'use client';

import maplibregl, { type GeoJSONSource, type Map as MapLibreMap, type Marker } from 'maplibre-gl';
import { useEffect, useRef } from 'react';
import { createRasterMapStyle } from '@/components/mapStyle';
import type { RouteWaypoint } from '@/lib/api';

type Props = {
  className?: string;
  waypoints: RouteWaypoint[];
};

const LINE_SOURCE_ID = 'route-preview-line';
const LINE_LAYER_ID = 'route-preview-line';

export default function RouteMapPreview({ className = 'map-mini', waypoints }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Marker[]>([]);

  useEffect(() => {
    if (containerRef.current == null || mapRef.current != null) {
      return;
    }

    const firstWaypoint = waypoints[0];
    const map = new maplibregl.Map({
      center:
        firstWaypoint == null
          ? [121.5654, 25.033]
          : [firstWaypoint.longitude, firstWaypoint.latitude],
      container: containerRef.current,
      interactive: false,
      style: createRasterMapStyle(),
      zoom: firstWaypoint == null ? 11 : 14,
    });

    map.on('load', () => {
      map.addSource(LINE_SOURCE_ID, {
        data: toLineFeature(waypoints),
        type: 'geojson',
      });
      map.addLayer({
        id: LINE_LAYER_ID,
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': '#d97644',
          'line-width': 4,
        },
        source: LINE_SOURCE_ID,
        type: 'line',
      });
      syncMarkers(map, markersRef.current, waypoints);
      fitWaypoints(map, waypoints);
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
  }, [waypoints]);

  useEffect(() => {
    const map = mapRef.current;

    if (map == null) {
      return;
    }

    const update = () => {
      updateLine(map, waypoints);
      syncMarkers(map, markersRef.current, waypoints);
      fitWaypoints(map, waypoints);
    };

    if (map.isStyleLoaded()) {
      update();
    } else {
      map.once('load', update);
    }
  }, [waypoints]);

  return <div className={className} ref={containerRef} />;
}

function syncMarkers(map: MapLibreMap, existingMarkers: Marker[], waypoints: RouteWaypoint[]) {
  existingMarkers.forEach((marker) => {
    marker.remove();
  });
  existingMarkers.length = 0;

  waypoints.forEach((waypoint, index) => {
    const marker = new maplibregl.Marker({
      color: index === 0 ? '#d97644' : '#c5612f',
    })
      .setLngLat([waypoint.longitude, waypoint.latitude])
      .addTo(map);

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
      duration: 0,
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
    duration: 0,
    maxZoom: 15,
    padding: 40,
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
