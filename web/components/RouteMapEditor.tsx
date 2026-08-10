'use client';

import maplibregl, { type GeoJSONSource, type Map as MapLibreMap, type Marker } from 'maplibre-gl';
import { useEffect, useRef, useState } from 'react';
import { getStyleByName } from '@/components/mapStyle';
import { Button } from '@/components/ui/radix-ui';
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
  hoveredWaypointIndex?: number | null;
  onChange: (waypoints: RouteWaypoint[]) => void;
  onHoverWaypoint?: (index: number | null) => void;
  onReady?: (controls: RouteMapControls) => void;
  onSelectWaypoint?: (index: number) => void;
  selectedWaypointIndex?: number | null;
  waypoints: RouteWaypoint[];
};

const COMPACT_MARKER_COUNT = 8;
const LINE_SOURCE_ID = 'route-line';
const LINE_LAYER_ID = 'route-line';

export default function RouteMapEditor({
  className = 'map',
  fitRequest = 0,
  focusTarget = null,
  hoveredWaypointIndex = null,
  onChange,
  onHoverWaypoint,
  onReady,
  onSelectWaypoint,
  selectedWaypointIndex = null,
  waypoints,
}: Props) {
  const { styleName } = useMapStyle();
  const [mapAttempt, setMapAttempt] = useState(0);
  const [mapStatus, setMapStatus] = useState<'error' | 'loading' | 'ready'>('loading');
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const onChangeRef = useRef(onChange);
  const onHoverWaypointRef = useRef(onHoverWaypoint);
  const onReadyRef = useRef(onReady);
  const onSelectWaypointRef = useRef(onSelectWaypoint);
  const hoveredWaypointIndexRef = useRef(hoveredWaypointIndex);
  const selectedWaypointIndexRef = useRef(selectedWaypointIndex);
  const waypointsRef = useRef(waypoints);
  const currentStyleNameRef = useRef(styleName);

  useEffect(() => {
    hoveredWaypointIndexRef.current = hoveredWaypointIndex;
    onChangeRef.current = onChange;
    onHoverWaypointRef.current = onHoverWaypoint;
    onReadyRef.current = onReady;
    onSelectWaypointRef.current = onSelectWaypoint;
    selectedWaypointIndexRef.current = selectedWaypointIndex;
    waypointsRef.current = waypoints;
  }, [
    hoveredWaypointIndex,
    onChange,
    onHoverWaypoint,
    onReady,
    onSelectWaypoint,
    selectedWaypointIndex,
    waypoints,
  ]);

  useEffect(() => {
    void mapAttempt;
    if (containerRef.current == null || mapRef.current != null) {
      return;
    }

    setMapStatus('loading');
    const firstWaypoint = waypointsRef.current[0];
    let map: MapLibreMap;
    try {
      map = new maplibregl.Map({
        center:
          firstWaypoint == null
            ? [121.5654, 25.033]
            : [firstWaypoint.longitude, firstWaypoint.latitude],
        container: containerRef.current,
        style: getStyleByName(currentStyleNameRef.current),
        zoom: firstWaypoint == null ? 11 : 14,
      });
    } catch {
      setMapStatus('error');
      onReadyRef.current?.(createEmptyRouteMapControls());
      return;
    }

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    const styleReadyTimeout = window.setTimeout(() => {
      if (!map.loaded() && !map.isStyleLoaded()) {
        setMapStatus('error');
        onReadyRef.current?.(createEmptyRouteMapControls());
      }
    }, 12_000);
    map.on('load', () => {
      window.clearTimeout(styleReadyTimeout);
      setMapStatus('ready');
      syncLineLayer(map, waypointsRef.current);
      syncMarkers({
        existingMarkers: markersRef.current,
        map,
        onChange: onChangeRef.current,
        onHoverWaypoint: onHoverWaypointRef.current,
        onSelectWaypoint: onSelectWaypointRef.current,
        waypoints: waypointsRef.current,
      });
      updateMarkerDisplay(
        markersRef.current,
        selectedWaypointIndexRef.current,
        hoveredWaypointIndexRef.current,
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
    mapRef.current = map;

    return () => {
      markersRef.current.forEach((marker) => {
        marker.remove();
      });
      markersRef.current = [];
      window.clearTimeout(styleReadyTimeout);
      onReadyRef.current?.(createEmptyRouteMapControls());
      map.remove();
      mapRef.current = null;
    };
  }, [mapAttempt]);

  useEffect(() => {
    // Dependencies trigger resync; deferred style.load uses refs to avoid stale route data.
    void onChange;
    void onHoverWaypoint;
    void onSelectWaypoint;
    void waypoints;

    const map = mapRef.current;

    if (map == null) {
      return;
    }

    const update = () => {
      const currentWaypoints = waypointsRef.current;

      syncLineLayer(map, currentWaypoints);
      syncMarkers({
        existingMarkers: markersRef.current,
        map,
        onChange: onChangeRef.current,
        onHoverWaypoint: onHoverWaypointRef.current,
        onSelectWaypoint: onSelectWaypointRef.current,
        waypoints: currentWaypoints,
      });
      updateMarkerDisplay(
        markersRef.current,
        selectedWaypointIndexRef.current,
        hoveredWaypointIndexRef.current,
        currentWaypoints.length,
      );
    };

    if (canSyncRouteLayer(map)) {
      update();
      return;
    }

    map.once('style.load', update);

    return () => {
      map.off('style.load', update);
    };
  }, [onChange, onHoverWaypoint, onSelectWaypoint, waypoints]);

  useEffect(() => {
    const map = mapRef.current;

    if (map == null) {
      return;
    }

    updateMarkerDisplay(
      markersRef.current,
      selectedWaypointIndex,
      hoveredWaypointIndex,
      waypoints.length,
    );
  }, [hoveredWaypointIndex, selectedWaypointIndex, waypoints.length]);

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
      currentStyleNameRef.current = styleName;
      return;
    }

    if (currentStyleNameRef.current === styleName) {
      return;
    }

    currentStyleNameRef.current = styleName;

    const center = map.getCenter();
    const zoom = map.getZoom();
    const bearing = map.getBearing();
    const pitch = map.getPitch();

    const update = () => {
      syncLineLayer(map, waypointsRef.current);
      syncMarkers({
        existingMarkers: markersRef.current,
        map,
        onChange: onChangeRef.current,
        onHoverWaypoint: onHoverWaypointRef.current,
        onSelectWaypoint: onSelectWaypointRef.current,
        waypoints: waypointsRef.current,
      });
      updateMarkerDisplay(
        markersRef.current,
        selectedWaypointIndexRef.current,
        hoveredWaypointIndexRef.current,
        waypointsRef.current.length,
      );
      map.jumpTo({ bearing, center, pitch, zoom });
    };

    map.setStyle(getStyleByName(styleName));
    map.once('style.load', update);

    return () => {
      map.off('style.load', update);
    };
  }, [styleName]);

  return (
    <div className={`${className} route-map-shell`}>
      <div className="route-map-canvas" ref={containerRef} />
      {mapStatus === 'ready' ? null : (
        <div
          className={`route-map-status route-map-status-${mapStatus}`}
          role={mapStatus === 'error' ? 'alert' : 'status'}
        >
          {mapStatus === 'loading' ? (
            <span>Loading map…</span>
          ) : (
            <>
              <strong>Map unavailable</strong>
              <span>Exact waypoint editing is still available in the Route editor.</span>
              <Button
                className="secondary"
                type="button"
                onClick={() => setMapAttempt((value) => value + 1)}
              >
                Retry map
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function syncMarkers({
  existingMarkers,
  map,
  onChange,
  onHoverWaypoint,
  onSelectWaypoint,
  waypoints,
}: {
  existingMarkers: Marker[];
  map: MapLibreMap;
  onChange: (waypoints: RouteWaypoint[]) => void;
  onHoverWaypoint?: (index: number | null) => void;
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
    marker.getElement().addEventListener('mouseenter', () => onHoverWaypoint?.(index));
    marker.getElement().addEventListener('mouseleave', () => onHoverWaypoint?.(null));
    marker.getElement().addEventListener('focus', () => onHoverWaypoint?.(index));
    marker.getElement().addEventListener('blur', () => onHoverWaypoint?.(null));
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
  hoveredWaypointIndex: number | null,
  waypointCount: number,
) {
  const useCompactMarkers = waypointCount >= COMPACT_MARKER_COUNT;

  markers.forEach((marker, index) => {
    const element = marker.getElement();
    const isHovered = hoveredWaypointIndex === index;
    const isSelected = selectedWaypointIndex === index;
    const isTerminal = index === 0 || index === waypointCount - 1;

    element.classList.toggle('hovered', isHovered);
    element.classList.toggle('selected', isSelected);
    element.classList.toggle('route-marker-compact', useCompactMarkers && !isTerminal);
    element.setAttribute(
      'aria-label',
      [
        `Waypoint ${index + 1}`,
        index === 0 ? 'start' : null,
        index === waypointCount - 1 ? 'end' : null,
        isSelected ? 'selected' : null,
      ]
        .filter(Boolean)
        .join(', '),
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

function canSyncRouteLayer(map: MapLibreMap): boolean {
  return map.isStyleLoaded() || map.getSource(LINE_SOURCE_ID) != null;
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
