'use client';

import type { Feature, LineString } from 'geojson';
import type { GeoJSONSource, Map as MapLibreMap, Marker } from 'maplibre-gl';
import * as maplibregl from 'maplibre-gl';
import { useEffect, useRef, useState } from 'react';
import { getStyleByName } from '@/components/mapStyle';
import type { RouteMapCapability } from '@/components/routeMapCapability';
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
  onCapabilityChange?: (capability: RouteMapCapability) => void;
  onChange: (waypoints: RouteWaypoint[]) => void;
  onHoverWaypoint?: (index: number | null) => void;
  onReady?: (controls: RouteMapControls) => void;
  onSelectWaypoint?: (index: number) => void;
  selectedWaypointIndex?: number | null;
  waypoints: RouteWaypoint[];
};

const LINE_SOURCE_ID = 'route-line';
const LINE_LAYER_ID = 'route-line';

export default function RouteMapEditor({
  className = 'map',
  fitRequest = 0,
  focusTarget = null,
  hoveredWaypointIndex = null,
  onCapabilityChange,
  onChange,
  onHoverWaypoint,
  onReady,
  onSelectWaypoint,
  selectedWaypointIndex = null,
  waypoints,
}: Props) {
  const { styleName } = useMapStyle();
  const [mapAttempt, setMapAttempt] = useState(0);
  const [mapStatus, setMapStatus] = useState<RouteMapCapability>('loading');
  const canEditRouteRef = useRef(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const hasLoadedRef = useRef(false);
  const isMapClickAttachedRef = useRef(false);
  const mapClickHandlerRef = useRef<((event: maplibregl.MapMouseEvent) => void) | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const mapStatusRef = useRef<RouteMapCapability>('loading');
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
    onCapabilityChange?.(mapStatus);
  }, [mapStatus, onCapabilityChange]);

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

    mapStatusRef.current = 'loading';
    setMapStatus('loading');
    canEditRouteRef.current = false;
    hasLoadedRef.current = false;
    const firstWaypoint = waypointsRef.current[0];
    if (!isWebGlAvailable()) {
      mapStatusRef.current = 'unavailable';
      setMapStatus('unavailable');
      onReadyRef.current?.(createEmptyRouteMapControls());
      return;
    }

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
      setMapCanvasAvailable(map, false);
    } catch {
      containerRef.current.replaceChildren();
      mapStatusRef.current = 'unavailable';
      setMapStatus('unavailable');
      onReadyRef.current?.(createEmptyRouteMapControls());
      return;
    }

    const handleMapClick = (event: maplibregl.MapMouseEvent) => {
      if (!canEditRouteRef.current) {
        return;
      }
      onChangeRef.current([
        ...waypointsRef.current,
        {
          latitude: roundCoord(event.lngLat.lat),
          longitude: roundCoord(event.lngLat.lng),
        },
      ]);
      onSelectWaypointRef.current?.(waypointsRef.current.length);
    };
    mapClickHandlerRef.current = handleMapClick;
    const styleReadyTimeout = window.setTimeout(() => {
      if (!map.loaded() && !map.isStyleLoaded()) {
        canEditRouteRef.current = false;
        setMapCanvasAvailable(map, false);
        mapStatusRef.current = 'unavailable';
        setMapStatus('unavailable');
        onReadyRef.current?.(createEmptyRouteMapControls());
      }
    }, 12_000);
    const handleLoad = () => {
      window.clearTimeout(styleReadyTimeout);
      hasLoadedRef.current = true;
      try {
        syncRoutePreview({
          existingMarkers: markersRef.current,
          hoveredWaypointIndex: hoveredWaypointIndexRef.current,
          map,
          onChange: onChangeRef.current,
          onHoverWaypoint: onHoverWaypointRef.current,
          onSelectWaypoint: onSelectWaypointRef.current,
          selectedWaypointIndex: selectedWaypointIndexRef.current,
          waypoints: waypointsRef.current,
        });
        canEditRouteRef.current = true;
        setMapCanvasAvailable(map, true);
        mapStatusRef.current = 'ready';
        setMapStatus('ready');
        if (!isMapClickAttachedRef.current) {
          map.on('click', handleMapClick);
          isMapClickAttachedRef.current = true;
        }
        fitWaypoints(map, waypointsRef.current);
        onReadyRef.current?.(createRouteMapControls(map, waypointsRef));
      } catch {
        clearMarkers(markersRef.current);
        canEditRouteRef.current = false;
        setMapCanvasAvailable(map, true);
        mapStatusRef.current = 'route-preview-error';
        setMapStatus('route-preview-error');
        onReadyRef.current?.(createEmptyRouteMapControls());
      }
    };
    map.on('load', handleLoad);
    mapRef.current = map;

    return () => {
      clearMarkers(markersRef.current);
      window.clearTimeout(styleReadyTimeout);
      map.off('click', handleMapClick);
      map.off('load', handleLoad);
      canEditRouteRef.current = false;
      hasLoadedRef.current = false;
      isMapClickAttachedRef.current = false;
      if (mapClickHandlerRef.current === handleMapClick) {
        mapClickHandlerRef.current = null;
      }
      onReadyRef.current?.(createEmptyRouteMapControls());
      map.remove();
      mapRef.current = null;
    };
  }, [mapAttempt]);

  useEffect(() => {
    // Resync when the waypoint array changes; refs keep deferred style callbacks current.
    void waypoints;
    const map = mapRef.current;

    if (map == null || !hasLoadedRef.current) {
      return;
    }

    const update = () => {
      try {
        syncRoutePreview({
          existingMarkers: markersRef.current,
          hoveredWaypointIndex: hoveredWaypointIndexRef.current,
          map,
          onChange: onChangeRef.current,
          onHoverWaypoint: onHoverWaypointRef.current,
          onSelectWaypoint: onSelectWaypointRef.current,
          selectedWaypointIndex: selectedWaypointIndexRef.current,
          waypoints: waypointsRef.current,
        });
        canEditRouteRef.current = true;
        const mapClickHandler = mapClickHandlerRef.current;
        if (!isMapClickAttachedRef.current && mapClickHandler != null) {
          map.on('click', mapClickHandler);
          isMapClickAttachedRef.current = true;
        }
        if (mapStatusRef.current !== 'ready') {
          setMapCanvasAvailable(map, true);
          mapStatusRef.current = 'ready';
          setMapStatus('ready');
          onReadyRef.current?.(createRouteMapControls(map, waypointsRef));
        }
      } catch {
        clearMarkers(markersRef.current);
        canEditRouteRef.current = false;
        if (mapStatusRef.current !== 'route-preview-error') {
          mapStatusRef.current = 'route-preview-error';
          setMapStatus('route-preview-error');
          onReadyRef.current?.(createEmptyRouteMapControls());
        }
      }
    };

    if (canSyncRouteLayer(map)) {
      update();
      return;
    }

    map.once('style.load', update);

    return () => {
      map.off('style.load', update);
    };
  }, [waypoints]);

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

    if (map == null || focusTarget == null || !canEditRouteRef.current) {
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

    if (map == null || fitRequest === 0 || !canEditRouteRef.current) {
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
    canEditRouteRef.current = false;
    setMapCanvasAvailable(map, false);
    mapStatusRef.current = 'loading';
    setMapStatus('loading');
    onReadyRef.current?.(createEmptyRouteMapControls());

    const styleReadyTimeout = window.setTimeout(() => {
      canEditRouteRef.current = false;
      setMapCanvasAvailable(map, false);
      mapStatusRef.current = 'unavailable';
      setMapStatus('unavailable');
      onReadyRef.current?.(createEmptyRouteMapControls());
    }, 12_000);
    const update = () => {
      window.clearTimeout(styleReadyTimeout);
      try {
        syncRoutePreview({
          existingMarkers: markersRef.current,
          hoveredWaypointIndex: hoveredWaypointIndexRef.current,
          map,
          onChange: onChangeRef.current,
          onHoverWaypoint: onHoverWaypointRef.current,
          onSelectWaypoint: onSelectWaypointRef.current,
          selectedWaypointIndex: selectedWaypointIndexRef.current,
          waypoints: waypointsRef.current,
        });
        map.jumpTo({ bearing, center, pitch, zoom });
        canEditRouteRef.current = true;
        setMapCanvasAvailable(map, true);
        mapStatusRef.current = 'ready';
        setMapStatus('ready');
        onReadyRef.current?.(createRouteMapControls(map, waypointsRef));
      } catch {
        clearMarkers(markersRef.current);
        canEditRouteRef.current = false;
        setMapCanvasAvailable(map, true);
        mapStatusRef.current = 'route-preview-error';
        setMapStatus('route-preview-error');
        onReadyRef.current?.(createEmptyRouteMapControls());
      }
    };

    map.once('style.load', update);
    try {
      map.setStyle(getStyleByName(styleName));
    } catch {
      window.clearTimeout(styleReadyTimeout);
      map.off('style.load', update);
      canEditRouteRef.current = false;
      setMapCanvasAvailable(map, false);
      mapStatusRef.current = 'unavailable';
      setMapStatus('unavailable');
      onReadyRef.current?.(createEmptyRouteMapControls());
    }

    return () => {
      window.clearTimeout(styleReadyTimeout);
      map.off('style.load', update);
    };
  }, [styleName]);

  return (
    <div className={`${className} route-map-shell route-map-capability-${mapStatus}`}>
      <div className="route-map-canvas" ref={containerRef} />
      {mapStatus === 'ready' ? null : (
        <div
          className={`route-map-status route-map-status-${mapStatus}`}
          role={mapStatus === 'loading' ? 'status' : 'alert'}
        >
          {mapStatus === 'loading' ? (
            <span>Loading map…</span>
          ) : (
            <>
              <strong>
                {mapStatus === 'unavailable' ? 'Map unavailable' : 'Route preview unavailable'}
              </strong>
              <span>
                {mapStatus === 'unavailable'
                  ? 'Use saved places or exact coordinates while the map is unavailable.'
                  : 'The basemap loaded, but the route line and markers could not be shown. Use the Route editor for precise changes.'}
              </span>
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

function syncRoutePreview({
  existingMarkers,
  hoveredWaypointIndex,
  map,
  onChange,
  onHoverWaypoint,
  onSelectWaypoint,
  selectedWaypointIndex,
  waypoints,
}: {
  existingMarkers: Marker[];
  hoveredWaypointIndex: number | null;
  map: MapLibreMap;
  onChange: (waypoints: RouteWaypoint[]) => void;
  onHoverWaypoint?: (index: number | null) => void;
  onSelectWaypoint?: (index: number) => void;
  selectedWaypointIndex: number | null;
  waypoints: RouteWaypoint[];
}) {
  syncLineLayer(map, waypoints);
  syncMarkers({
    existingMarkers,
    map,
    onChange,
    onHoverWaypoint,
    onSelectWaypoint,
    waypoints,
  });
  updateMarkerDisplay(
    existingMarkers,
    selectedWaypointIndex,
    hoveredWaypointIndex,
    waypoints.length,
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
  clearMarkers(existingMarkers);

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
  element.className = `route-marker ${positionClass}${label.length >= 3 ? ' route-marker-wide' : ''}`;
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
  markers.forEach((marker, index) => {
    const element = marker.getElement();
    const isHovered = hoveredWaypointIndex === index;
    const isSelected = selectedWaypointIndex === index;

    element.classList.toggle('hovered', isHovered);
    element.classList.toggle('selected', isSelected);
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

function isWebGlAvailable(): boolean {
  const canvas = document.createElement('canvas');
  try {
    const context = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    if (context == null) {
      return false;
    }
    context.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
}

function createRouteMapControls(
  map: MapLibreMap,
  waypointsRef: { current: RouteWaypoint[] },
): RouteMapControls {
  return {
    fit: () => fitWaypoints(map, waypointsRef.current),
    zoomIn: () => map.zoomIn({ duration: 180 }),
    zoomOut: () => map.zoomOut({ duration: 180 }),
  };
}

function createEmptyRouteMapControls(): RouteMapControls {
  return {
    fit: () => undefined,
    zoomIn: () => undefined,
    zoomOut: () => undefined,
  };
}

function setMapCanvasAvailable(map: MapLibreMap, available: boolean) {
  const canvas = map.getCanvas();
  canvas.tabIndex = available ? 0 : -1;
  if (available) {
    canvas.removeAttribute('aria-hidden');
  } else {
    canvas.setAttribute('aria-hidden', 'true');
  }
}

function clearMarkers(markers: Marker[]) {
  markers.forEach((marker) => {
    marker.remove();
  });
  markers.length = 0;
}

function roundCoord(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
