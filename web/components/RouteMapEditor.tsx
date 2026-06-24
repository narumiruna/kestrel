'use client';

import maplibregl, { type GeoJSONSource, type Map as MapLibreMap, type Marker } from 'maplibre-gl';
import { useEffect, useRef } from 'react';
import { getStyleByName } from '@/components/mapStyle';
import { useMapStyle } from '@/hooks/useMapStyle';
import type { RouteWaypoint } from '@/lib/api';

export type RouteMapControls = {
  fit: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
};

type Props = {
  className?: string;
  fitRequest?: number;
  focusTarget?: RouteWaypoint | null;
  onChange: (waypoints: RouteWaypoint[]) => void;
  onReady?: (controls: RouteMapControls) => void;
  onSelectWaypoint?: (index: number) => void;
  selectedWaypointIndex?: number | null;
  waypoints: RouteWaypoint[];
};

const COMPACT_MARKER_COUNT = 8;
const COMPACT_MARKER_ZOOM = 13;
const LINE_SOURCE_ID = 'route-line';
const LINE_LAYER_ID = 'route-line';

export default function RouteMapEditor({
  className = 'map',
  fitRequest = 0,
  focusTarget = null,
  onChange,
  onReady,
  onSelectWaypoint,
  selectedWaypointIndex = null,
  waypoints,
}: Props) {
  const { styleName } = useMapStyle();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const onChangeRef = useRef(onChange);
  const onReadyRef = useRef(onReady);
  const onSelectWaypointRef = useRef(onSelectWaypoint);
  const selectedWaypointIndexRef = useRef(selectedWaypointIndex);
  const waypointsRef = useRef(waypoints);
  const initialStyleNameRef = useRef(styleName);

  useEffect(() => {
    onChangeRef.current = onChange;
    onReadyRef.current = onReady;
    onSelectWaypointRef.current = onSelectWaypoint;
    selectedWaypointIndexRef.current = selectedWaypointIndex;
    waypointsRef.current = waypoints;
  }, [onChange, onReady, onSelectWaypoint, selectedWaypointIndex, waypoints]);

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
      style: getStyleByName(initialStyleNameRef.current),
      zoom: firstWaypoint == null ? 11 : 14,
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.on('load', () => {
      syncLineLayer(map, waypointsRef.current);
      syncMarkers({
        existingMarkers: markersRef.current,
        map,
        onChange: onChangeRef.current,
        onSelectWaypoint: onSelectWaypointRef.current,
        waypoints: waypointsRef.current,
      });
      updateMarkerDisplay(
        markersRef.current,
        selectedWaypointIndexRef.current,
        map.getZoom(),
        waypointsRef.current.length,
      );
      fitWaypoints(map, waypointsRef.current);
      onReadyRef.current?.({
        fit: () => fitWaypoints(map, waypointsRef.current),
        zoomIn: () => map.zoomIn({ duration: 180 }),
        zoomOut: () => map.zoomOut({ duration: 180 }),
      });
    });
    map.on('click', (event) => {
      onChangeRef.current([
        ...waypointsRef.current,
        {
          latitude: roundCoord(event.lngLat.lat),
          longitude: roundCoord(event.lngLat.lng),
        },
      ]);
      onSelectWaypointRef.current?.(waypointsRef.current.length);
    });
    map.on('zoom', () => {
      updateMarkerDisplay(
        markersRef.current,
        selectedWaypointIndexRef.current,
        map.getZoom(),
        waypointsRef.current.length,
      );
    });

    mapRef.current = map;

    return () => {
      markersRef.current.forEach((marker) => {
        marker.remove();
      });
      markersRef.current = [];
      onReadyRef.current?.(createEmptyRouteMapControls());
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
      syncMarkers({
        existingMarkers: markersRef.current,
        map,
        onChange,
        onSelectWaypoint,
        waypoints,
      });
      updateMarkerDisplay(
        markersRef.current,
        selectedWaypointIndexRef.current,
        map.getZoom(),
        waypoints.length,
      );
    };

    if (map.isStyleLoaded()) {
      update();
    } else {
      map.once('load', update);
    }
  }, [onChange, onSelectWaypoint, waypoints]);

  useEffect(() => {
    const map = mapRef.current;

    if (map == null) {
      return;
    }

    updateMarkerDisplay(markersRef.current, selectedWaypointIndex, map.getZoom(), waypoints.length);
  }, [selectedWaypointIndex, waypoints.length]);

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

  useEffect(() => {
    const map = mapRef.current;

    if (map == null || fitRequest === 0) {
      return;
    }

    fitWaypoints(map, waypointsRef.current);
  }, [fitRequest]);

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
      syncMarkers({
        existingMarkers: markersRef.current,
        map,
        onChange: onChangeRef.current,
        onSelectWaypoint: onSelectWaypointRef.current,
        waypoints: waypointsRef.current,
      });
      updateMarkerDisplay(
        markersRef.current,
        selectedWaypointIndexRef.current,
        map.getZoom(),
        waypointsRef.current.length,
      );
      map.jumpTo({ bearing, center, pitch, zoom });
    });
  }, [styleName]);

  return <div className={className} ref={containerRef} />;
}

function syncMarkers({
  existingMarkers,
  map,
  onChange,
  onSelectWaypoint,
  waypoints,
}: {
  existingMarkers: Marker[];
  map: MapLibreMap;
  onChange: (waypoints: RouteWaypoint[]) => void;
  onSelectWaypoint?: (index: number) => void;
  waypoints: RouteWaypoint[];
}) {
  existingMarkers.forEach((marker) => {
    marker.remove();
  });
  existingMarkers.length = 0;

  waypoints.forEach((waypoint, index) => {
    const marker = new maplibregl.Marker({
      draggable: true,
      element: createMarkerElement({
        index,
        waypointCount: waypoints.length,
      }),
    })
      .setLngLat([waypoint.longitude, waypoint.latitude])
      .addTo(map);

    marker.getElement().addEventListener('click', (event) => {
      event.stopPropagation();
      onSelectWaypoint?.(index);
    });
    marker.on('dragstart', () => {
      onSelectWaypoint?.(index);
    });
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

function createMarkerElement({ index, waypointCount }: { index: number; waypointCount: number }) {
  const element = document.createElement('button');
  const label = getWaypointShortLabel(index);
  const positionClass = getWaypointMarkerPositionClass(index, waypointCount);
  element.className = `route-marker ${positionClass}`;
  element.dataset.label = label;
  element.textContent = label;
  element.type = 'button';
  element.setAttribute('aria-label', `Waypoint ${label}`);

  return element;
}

function updateMarkerDisplay(
  markers: Marker[],
  selectedWaypointIndex: number | null,
  zoom: number,
  waypointCount: number,
) {
  const useCompactMarkers = waypointCount >= COMPACT_MARKER_COUNT && zoom < COMPACT_MARKER_ZOOM;

  markers.forEach((marker, index) => {
    const element = marker.getElement();
    const isSelected = selectedWaypointIndex === index;
    const isTerminal = index === 0 || index === waypointCount - 1;

    element.classList.toggle('selected', isSelected);
    element.classList.toggle(
      'route-marker-compact',
      useCompactMarkers && !isTerminal && !isSelected,
    );
  });
}

function getWaypointShortLabel(index: number): string {
  return `${index + 1}`;
}

function getWaypointMarkerPositionClass(index: number, waypointCount: number): string {
  if (index === 0) {
    return 'route-marker-start';
  }

  if (index === waypointCount - 1) {
    return 'route-marker-end';
  }

  return 'route-marker-middle';
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

function syncLineLayer(map: MapLibreMap, waypoints: RouteWaypoint[]) {
  if (map.getSource(LINE_SOURCE_ID) == null) {
    map.addSource(LINE_SOURCE_ID, {
      data: toLineFeature(waypoints),
      type: 'geojson',
    });
  }

  if (map.getLayer(`${LINE_LAYER_ID}-shadow`) == null) {
    map.addLayer({
      id: `${LINE_LAYER_ID}-shadow`,
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
      },
      paint: {
        'line-color': '#fffaf3',
        'line-opacity': 0.95,
        'line-width': 8,
      },
      source: LINE_SOURCE_ID,
      type: 'line',
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
        'line-color': '#f05a28',
        'line-width': 4.5,
      },
      source: LINE_SOURCE_ID,
      type: 'line',
    });
  }

  if (map.getLayer(`${LINE_LAYER_ID}-arrows`) == null) {
    map.addLayer({
      id: `${LINE_LAYER_ID}-arrows`,
      layout: {
        'symbol-placement': 'line',
        'symbol-spacing': 96,
        'text-field': '➜',
        'text-keep-upright': false,
        'text-rotation-alignment': 'map',
        'text-size': 16,
      },
      paint: {
        'text-color': '#7a2f16',
        'text-halo-color': '#fffaf3',
        'text-halo-width': 1.5,
      },
      source: LINE_SOURCE_ID,
      type: 'symbol',
    });
  }

  updateLine(map, waypoints);
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

function createEmptyRouteMapControls(): RouteMapControls {
  return {
    fit: () => undefined,
    zoomIn: () => undefined,
    zoomOut: () => undefined,
  };
}

function roundCoord(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
