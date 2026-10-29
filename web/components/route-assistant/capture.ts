import type { Map as MapLibreMap, Marker } from 'maplibre-gl';
import {
  type AssistantSnapshot,
  type AssistantTransform,
  type AssistantWaypoint,
  ROUTE_ASSISTANT_LIMITS as LIMITS,
} from '../../lib/route-assistant.ts';
import type { MapStyleName } from '../mapStyle';

type Point = { x: number; y: number };
type LngLat = { lng: number; lat: number };
const ATTRIBUTION = '© OpenStreetMap contributors · https://www.openstreetmap.org/copyright';
const fail = (message: string): never => {
  throw new Error(message);
};

/** Coordinates are normalized to mapRect, never to the attribution margin. */
export function mercator({ lng, lat }: LngLat): [number, number] {
  if (!Number.isFinite(lng) || !Number.isFinite(lat) || Math.abs(lat) > 85.05112878)
    return fail('Unsupported Mercator latitude. Adjust the view and capture again.');
  return [(lng + 180) / 360, (1 - Math.asinh(Math.tan((lat * Math.PI) / 180)) / Math.PI) / 2];
}

export function captureDimensions(cssWidth: number, cssHeight: number) {
  if (![cssWidth, cssHeight].every((n) => Number.isFinite(n) && n > 0))
    return fail('Map dimensions are unavailable.');
  const footer = 40;
  const scale = Math.min(1, LIMITS.imageSide / cssWidth, (LIMITS.imageSide - footer) / cssHeight);
  const width = Math.max(1, Math.floor(cssWidth * scale));
  const mapHeight = Math.max(1, Math.floor(cssHeight * scale));
  if (width < 320) return fail('Map is too narrow to include readable attribution.');
  return {
    width,
    height: mapHeight + footer,
    pixelScale: width / cssWidth,
    mapRect: { left: 0, top: 0, width, height: mapHeight },
  };
}

/** Public corner samples define an immutable affine basis; other samples verify it. */
export function freezeTransform(
  unproject: (point: [number, number]) => LngLat,
  cssWidth: number,
  cssHeight: number,
  outputWidth: number,
  outputHeight: number,
): AssistantTransform {
  const sample = (u: number, v: number) => mercator(unproject([u * cssWidth, v * cssHeight]));
  const origin = sample(0, 0);
  const right = sample(1, 0);
  const bottom = sample(0, 1);
  const xAxis: [number, number] = [right[0] - origin[0], right[1] - origin[1]];
  const yAxis: [number, number] = [bottom[0] - origin[0], bottom[1] - origin[1]];
  const determinant = xAxis[0] * yAxis[1] - xAxis[1] * yAxis[0];
  if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-24)
    return fail('Map projection is not invertible.');
  const checks = [
    [0.5, 0.5],
    [0, 0.5],
    [1, 0.5],
    [0.5, 0],
    [0.5, 1],
    [1, 1],
    [0.25, 0.25],
    [0.75, 0.25],
    [0.25, 0.75],
    [0.75, 0.75],
  ].map(([u, v]) => {
    const [x, y] = sample(u, v);
    const dx = x - origin[0];
    const dy = y - origin[1];
    const actualU = (dx * yAxis[1] - dy * yAxis[0]) / determinant;
    const actualV = (dy * xAxis[0] - dx * xAxis[1]) / determinant;
    if (
      Math.hypot((actualU - u) * outputWidth, (actualV - v) * outputHeight) >
      LIMITS.projectionErrorPixels
    )
      return fail('Map projection does not match the captured frame.');
    return { u, v, x, y };
  });
  const corners = [origin, right, bottom, sample(1, 1)];
  if (Math.max(...corners.map(([x]) => x)) - Math.min(...corners.map(([x]) => x)) >= 1)
    return fail('Repeated worlds are ambiguous. Zoom in and capture again.');
  return { origin, xAxis, yAxis, checks };
}

export function markerPosition(anchor: Point, offset: Point, width: number, height: number) {
  return {
    u: anchor.x / width,
    v: anchor.y / height,
    x: anchor.x + offset.x,
    y: anchor.y + offset.y,
  };
}

export function hasImageContent(data: Uint8ClampedArray): boolean {
  let first = '';
  let different = false;
  let opaque = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 250) return false;
    opaque++;
    const color = `${data[i] >> 3},${data[i + 1] >> 3},${data[i + 2] >> 3}`;
    if (!first) first = color;
    else if (color !== first) different = true;
  }
  return opaque > 0 && different;
}

/** One deadline and abort listener cover idle, render, encoding, and base64 work. */
export function boundedCapture<T>(
  signal: AbortSignal,
  start: (resolve: (value: T) => void, reject: (error: unknown) => void) => () => void,
  ms: number = LIMITS.captureMs,
): Promise<T> {
  return new Promise((resolve, reject) => {
    let cleanup = () => {};
    let settled = false;
    const finish = (error?: unknown, value?: T) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      cleanup();
      if (error) reject(error);
      else resolve(value as T);
    };
    const abort = () => finish(new DOMException('Capture cancelled.', 'AbortError'));
    const timer = setTimeout(
      () => finish(new Error('Map capture timed out. Wait for tiles and try again.')),
      ms,
    );
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) {
      abort();
      return;
    }
    try {
      cleanup = start(
        (value) => finish(undefined, value),
        (error) => finish(error),
      );
    } catch (error) {
      finish(error);
    }
    if (settled) cleanup();
  });
}

type CaptureInput = {
  map: MapLibreMap | null;
  markers: readonly Marker[];
  waypoints: readonly AssistantWaypoint[];
  style: MapStyleName;
  signal: AbortSignal;
};

export async function captureRouteMap({
  map,
  markers,
  waypoints,
  style,
  signal,
}: CaptureInput): Promise<Omit<AssistantSnapshot, 'binding'>> {
  if (!map) return fail('Map is unavailable.');
  if (style === 'satellite')
    return fail('Satellite capture is unavailable: source permissions are pending.');
  const frozenWaypoints = waypoints.map((point) => ({ ...point }));
  const draft = JSON.stringify(waypoints);
  const fingerprint = () =>
    JSON.stringify({
      center: map.getCenter(),
      zoom: map.getZoom(),
      bearing: map.getBearing(),
      pitch: map.getPitch(),
      width: map.getCanvas().width,
      height: map.getCanvas().height,
      cssWidth: map.getCanvas().clientWidth,
      cssHeight: map.getCanvas().clientHeight,
      style: map.getStyle(),
      draft: waypoints,
      markers: markers.map((marker) => ({
        position: marker.getLngLat(),
        offset: marker.getOffset(),
        hidden: marker.getElement().hidden,
        label: marker.getElement().dataset.label,
        classes: marker.getElement().className,
      })),
    });
  const initial = fingerprint();
  let output: HTMLCanvasElement | null = null;
  let probe: HTMLCanvasElement | null = null;
  try {
    return await boundedCapture(signal, (resolve, reject) => {
      let stopped = false;
      let rendering = false;
      const changed = () => reject(new Error('Map changed during capture. Capture again.'));
      const error = () =>
        reject(new Error('Map tiles or rendering failed. Reload the map and capture again.'));
      const events = ['movestart', 'resize', 'styledata', 'remove'] as const;
      const render = () => {
        if (stopped || rendering) return;
        try {
          if (!map.loaded() || !map.isStyleLoaded() || !map.areTilesLoaded() || map.isMoving())
            return;
          rendering = true;
          if (initial !== fingerprint() || draft !== JSON.stringify(waypoints)) return changed();
          if (
            map.getPitch() !== 0 ||
            map.getTerrain() ||
            (map.getProjection()?.type ?? 'mercator') !== 'mercator'
          )
            return fail('Capture requires a flat Mercator map with zero pitch.');
          const source = map.getStyle().sources.osm;
          if (
            source?.type !== 'raster' ||
            source.tiles?.length !== 1 ||
            source.tiles[0] !== 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
          )
            return fail('This map source does not support capture.');
          const canvas = map.getCanvas();
          const cssWidth = canvas.clientWidth;
          const cssHeight = canvas.clientHeight;
          const dimensions = captureDimensions(cssWidth, cssHeight);
          const transform = freezeTransform(
            (point) => map.unproject(point),
            cssWidth,
            cssHeight,
            dimensions.mapRect.width,
            dimensions.mapRect.height,
          );
          output = document.createElement('canvas');
          output.width = dimensions.width;
          output.height = dimensions.height;
          const ctx = output.getContext('2d');
          if (!ctx) return fail('Screenshot canvas is unavailable.');
          // Copy within the render event, before WebGL clears the default framebuffer.
          ctx.drawImage(canvas, 0, 0, dimensions.width, dimensions.mapRect.height);
          probe = document.createElement('canvas');
          probe.width = 32;
          probe.height = 32;
          const sample = probe.getContext('2d');
          if (!sample) return fail('Screenshot validation is unavailable.');
          sample.drawImage(output, 0, 0, dimensions.width, dimensions.mapRect.height, 0, 0, 32, 32);
          if (!hasImageContent(sample.getImageData(0, 0, 32, 32).data))
            return fail('Map output is blank or incomplete.');
          ctx.save();
          ctx.beginPath();
          ctx.rect(0, 0, dimensions.width, dimensions.mapRect.height);
          ctx.clip();
          ctx.scale(dimensions.width / cssWidth, dimensions.mapRect.height / cssHeight);
          const visibleMarkers: AssistantSnapshot['visibleMarkers'] = [];
          markers.forEach((marker, index) => {
            const element = marker.getElement();
            // Only selected-route marker buttons are composed; no arbitrary DOM or popup text.
            if (!element.classList.contains('route-marker') || element.hidden) return;
            if (!element.classList.contains('maplibregl-marker-anchor-center'))
              fail('Unsupported route marker anchor.');
            const point = frozenWaypoints[index];
            const location = marker.getLngLat();
            if (
              !point ||
              Math.abs(location.lat - point.latitude) > 1e-8 ||
              Math.abs(((location.lng - point.longitude + 540) % 360) - 180) > 1e-8
            )
              fail('Route markers changed. Capture again.');
            const anchor = map.project(location);
            const p = markerPosition(anchor, marker.getOffset(), cssWidth, cssHeight);
            if (p.u < 0 || p.u > 1 || p.v < 0 || p.v > 1) return;
            const compact = element.classList.contains('route-marker-compact');
            const label = compact ? '' : (element.dataset.label ?? '');
            if (label.length > 100) fail('Route marker label is too long.');
            const bodyStyle = window.getComputedStyle(element, '::before');
            const labelStyle = window.getComputedStyle(element, '::after');
            const leader = element.querySelector('.route-marker-leader');
            ctx.strokeStyle = leader
              ? window.getComputedStyle(leader).backgroundColor
              : bodyStyle.borderColor;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(anchor.x, anchor.y);
            ctx.lineTo(p.x, p.y);
            ctx.stroke();
            const bodyWidth = Number.parseFloat(bodyStyle.width);
            const bodyHeight = Number.parseFloat(bodyStyle.height);
            if (
              ![bodyWidth, bodyHeight].every(
                (size) => Number.isFinite(size) && size > 0 && size < 100,
              )
            )
              fail('Unsupported marker dimensions.');
            ctx.fillStyle = bodyStyle.backgroundColor;
            ctx.strokeStyle = bodyStyle.borderColor;
            ctx.lineWidth = Number.parseFloat(bodyStyle.borderTopWidth) || 0;
            ctx.beginPath();
            ctx.roundRect(
              p.x - bodyWidth / 2,
              p.y - bodyHeight / 2,
              bodyWidth,
              bodyHeight,
              [
                bodyStyle.borderTopLeftRadius,
                bodyStyle.borderTopRightRadius,
                bodyStyle.borderBottomRightRadius,
                bodyStyle.borderBottomLeftRadius,
              ].map((radius) => Number.parseFloat(radius) || 0),
            );
            ctx.fill();
            if (ctx.lineWidth) ctx.stroke();
            ctx.fillStyle = labelStyle.color;
            ctx.font = `${labelStyle.fontWeight} ${labelStyle.fontSize} ${labelStyle.fontFamily}`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            if (label) ctx.fillText(label, p.x, p.y);
            if (label) visibleMarkers.push({ draftId: point.draftId, label, u: p.u, v: p.v });
          });
          ctx.restore();
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, dimensions.mapRect.height, dimensions.width, 40);
          ctx.fillStyle = '#202020';
          ctx.font = '11px sans-serif';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'top';
          ctx.fillText('© OpenStreetMap contributors', 6, dimensions.mapRect.height + 5);
          ctx.fillText(
            'https://www.openstreetmap.org/copyright',
            6,
            dimensions.mapRect.height + 21,
          );
          const center = map.getCenter();
          const bounds = map.getBounds();
          const capturedAt = Date.now();
          const view: AssistantSnapshot['view'] = {
            projection: 'mercator',
            pitch: 0,
            bearing: map.getBearing(),
            zoom: map.getZoom(),
            center: [wrapLongitude(center.lng), center.lat],
            bounds: [
              wrapLongitude(bounds.getWest()),
              bounds.getSouth(),
              wrapLongitude(bounds.getEast()),
              bounds.getNorth(),
            ],
            style,
            cssWidth,
            cssHeight,
            canvasWidth: canvas.width,
            canvasHeight: canvas.height,
            ...dimensions,
            pixelScale: canvas.width / cssWidth,
          };
          if (initial !== fingerprint()) return changed();
          output.toBlob((blob) => {
            if (stopped) return;
            if (!blob || blob.size > LIMITS.pngBytes) {
              reject(
                new Error('Screenshot exceeds the PNG size limit. Zoom in or reduce map size.'),
              );
              return;
            }
            void blob
              .arrayBuffer()
              .then((buffer) => {
                if (stopped) return;
                if (initial !== fingerprint()) return changed();
                const bytes = new Uint8Array(buffer);
                let binary = '';
                for (let i = 0; i < bytes.length; i += 8192)
                  binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
                resolve({
                  capturedAt,
                  view,
                  transform,
                  waypoints: frozenWaypoints,
                  visibleMarkers,
                  png: btoa(binary),
                });
              })
              .catch(reject);
          }, 'image/png');
        } catch (cause) {
          reject(
            cause instanceof DOMException && cause.name === 'SecurityError'
              ? new Error('Map export is blocked by cross-origin restrictions.')
              : cause,
          );
        }
      };
      const idle = () => {
        if (!stopped) map.triggerRepaint();
      };
      map.on('render', render);
      map.on('idle', idle);
      map.on('error', error);
      for (const event of events) map.on(event, changed);
      map.triggerRepaint();
      return () => {
        stopped = true;
        map.off('render', render);
        map.off('idle', idle);
        map.off('error', error);
        for (const event of events) map.off(event, changed);
      };
    });
  } finally {
    const release = (canvas: HTMLCanvasElement | null) => {
      if (canvas) {
        canvas.width = 0;
        canvas.height = 0;
      }
    };
    release(output);
    release(probe);
  }
}

function wrapLongitude(longitude: number) {
  return ((((longitude + 180) % 360) + 360) % 360) - 180;
}

export const OSM_CAPTURE_ATTRIBUTION = ATTRIBUTION;
