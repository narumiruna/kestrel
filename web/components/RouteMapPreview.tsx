'use client';

import type { Feature, LineString } from 'geojson';
import type { GeoJSONSource, Map as MapLibreMap, Marker } from 'maplibre-gl';
import * as maplibregl from 'maplibre-gl';
import { useEffect, useRef } from 'react';
import { getStyleByName } from '@/components/mapStyle';
import { useMapStyle } from '@/hooks/useMapStyle';
import type { RouteWaypoint } from '@/lib/api';

type Props = {
  className?: string;
  interactive?: boolean;
  onReady?: (controls: MapViewportControls) => void;
  waypoints: RouteWaypoint[];
};

export type MapViewportControls = {
  fit: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
};

const LINE_SOURCE_ID = 'route-preview-line';
const LINE_LAYER_ID = 'route-preview-line';

export default function RouteMapPreview({
  className = 'map-mini',
  interactive = false,
  onReady,
  waypoints,
}: Props) {
  const { styleName } = useMapStyle();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const waypointsRef = useRef(waypoints);
  const interactiveRef = useRef(interactive);
  const onReadyRef = useRef(onReady);
  const initialStyleNameRef = useRef(styleName);

  useEffect(() => {
    waypointsRef.current = waypoints;
  }, [waypoints]);

  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

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
      interactive: interactiveRef.current,
      style: getStyleByName(initialStyleNameRef.current),
      zoom: firstWaypoint == null ? 11 : 14,
    });

    map.on('load', () => {
      syncLineLayer(map, waypointsRef.current);
      syncMarkers(map, markersRef.current, waypointsRef.current);
      fitWaypoints(map, waypointsRef.current, 0);
      onReadyRef.current?.({
        fit: () => fitWaypoints(map, waypointsRef.current, 350),
        zoomIn: () => map.zoomIn({ duration: 180 }),
        zoomOut: () => map.zoomOut({ duration: 180 }),
      });
    });

    mapRef.current = map;

    return () => {
      markersRef.current.forEach((marker) => {
        marker.remove();
      });
      markersRef.current = [];
      onReadyRef.current?.(createEmptyViewportControls());
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;

    if (map == null) {
      return;
    }

    const update = () => {
      syncLineLayer(map, waypoints);
      syncMarkers(map, markersRef.current, waypoints);
      fitWaypoints(map, waypoints, 0);
    };

    if (map.isStyleLoaded()) {
      update();
    } else {
      map.once('load', update);
    }
  }, [waypoints]);

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
      syncLineLayer(map, waypointsRef.current);
      syncMarkers(map, markersRef.current, waypointsRef.current);
      map.jumpTo({ bearing, center, pitch, zoom });
    });
  }, [styleName]);

  return <div className={className} ref={containerRef} />;
}

function createEmptyViewportControls(): MapViewportControls {
  return {
    fit: () => undefined,
    zoomIn: () => undefined,
    zoomOut: () => undefined,
  };
}

function syncMarkers(map: MapLibreMap, existingMarkers: Marker[], waypoints: RouteWaypoint[]) {
  existingMarkers.forEach((marker) => {
    marker.remove();
  });
  existingMarkers.length = 0;

  waypoints.forEach((waypoint, index) => {
    const marker = new maplibregl.Marker({
      element: createPreviewMarkerElement(index, waypoints.length),
    })
      .setLngLat([waypoint.longitude, waypoint.latitude])
      .addTo(map);

    existingMarkers.push(marker);
  });
}

function createPreviewMarkerElement(index: number, waypointCount: number) {
  const element = document.createElement('span');
  element.className = 'route-marker route-marker-preview';
  element.textContent = getWaypointShortLabel(index, waypointCount);

  return element;
}

function getWaypointShortLabel(index: number, waypointCount: number): string {
  if (index === 0) {
    return 'S';
  }

  if (index === waypointCount - 1) {
    return 'E';
  }

  return `${index + 1}`;
}

function fitWaypoints(map: MapLibreMap, waypoints: RouteWaypoint[], duration: number) {
  if (waypoints.length === 0) {
    return;
  }

  if (waypoints.length === 1) {
    map.easeTo({
      center: [waypoints[0].longitude, waypoints[0].latitude],
      duration,
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
    duration,
    maxZoom: 15,
    padding: 40,
  });
}

function syncLineLayer(map: MapLibreMap, waypoints: RouteWaypoint[]) {
  if (map.getSource(LINE_SOURCE_ID) == null) {
    map.addSource(LINE_SOURCE_ID, {
      data: toLineFeature(waypoints),
      type: 'geojson',
    });
  }

  if (map.getLayer(LINE_LAYER_ID) == null) {
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
  }

  updateLine(map, waypoints);
}

function updateLine(map: MapLibreMap, waypoints: RouteWaypoint[]) {
  const source = map.getSource(LINE_SOURCE_ID) as GeoJSONSource | undefined;

  source?.setData(toLineFeature(waypoints));
}

function toLineFeature(waypoints: RouteWaypoint[]): Feature<LineString> {
  return {
    geometry: {
      coordinates: waypoints.map((waypoint) => [waypoint.longitude, waypoint.latitude]),
      type: 'LineString',
    },
    properties: {},
    type: 'Feature',
  };
}
