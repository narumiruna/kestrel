import { blue } from '@radix-ui/colors';
import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import type { RouteWaypoint } from '../../lib/api.ts';
import { getRouteCoordinates } from '../dashboard/routeViewport.ts';

const SOURCE = 'route-assistant-candidate';
const LAYER = 'route-assistant-candidate-line';

/** A separate review source. This never changes the current route source or camera. */
export function syncAssistantCandidate(map: MapLibreMap, points: RouteWaypoint[] | null) {
  if (!points) {
    if (map.getLayer(LAYER)) map.removeLayer(LAYER);
    if (map.getSource(SOURCE)) map.removeSource(SOURCE);
    return;
  }
  const data = {
    type: 'Feature' as const,
    properties: {},
    geometry: {
      type: 'LineString' as const,
      coordinates: getRouteCoordinates(points),
    },
  };
  if (!map.getSource(SOURCE)) map.addSource(SOURCE, { type: 'geojson', tolerance: 0, data });
  else (map.getSource(SOURCE) as GeoJSONSource).setData(data);
  if (!map.getLayer(LAYER))
    map.addLayer({
      id: LAYER,
      source: SOURCE,
      type: 'line',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': blue.blue9, 'line-width': 5, 'line-dasharray': [2, 1] },
    });
}
