import type { StyleSpecification } from 'maplibre-gl';

export type MapStyleName = 'field-notebook' | 'plain';

export const DEFAULT_MAP_CENTER = {
  latitude: 25.033,
  longitude: 121.5654,
};

export const DEFAULT_MAP_STYLE: MapStyleName = 'field-notebook';

const OSM_ATTRIBUTION = '© OpenStreetMap contributors';
const OSM_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

const MAP_STYLE_OPTIONS: Array<{ description: string; label: string; name: MapStyleName }> = [
  {
    description: 'Paper-tinted OSM raster tiles for the Kestrel field notebook workspace.',
    label: 'Field notebook',
    name: 'field-notebook',
  },
  {
    description: 'Plain OSM raster tiles for troubleshooting and maximum familiarity.',
    label: 'Plain',
    name: 'plain',
  },
];

export function getAvailableMapStyles() {
  return MAP_STYLE_OPTIONS;
}

export function isMapStyleName(value: string | null): value is MapStyleName {
  return value === 'field-notebook' || value === 'plain';
}

export function getNextMapStyleName(styleName: MapStyleName): MapStyleName {
  return styleName === 'field-notebook' ? 'plain' : 'field-notebook';
}

export function getMapStyleLabel(styleName: MapStyleName): string {
  return MAP_STYLE_OPTIONS.find((option) => option.name === styleName)?.label ?? 'Map';
}

export function getStyleByName(styleName: MapStyleName): StyleSpecification {
  return styleName === 'plain' ? createPlainMapStyle() : createFieldNotebookMapStyle();
}

export function createPlainMapStyle(): StyleSpecification {
  return {
    glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
    layers: [
      {
        id: 'osm',
        source: 'osm',
        type: 'raster',
      },
    ],
    sources: {
      osm: createOsmRasterSource(),
    },
    version: 8,
  };
}

export function createFieldNotebookMapStyle(): StyleSpecification {
  return {
    glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
    layers: [
      {
        id: 'paper',
        paint: {
          'background-color': '#efe1c3',
        },
        type: 'background',
      },
      {
        id: 'osm-paper-wash',
        paint: {
          'raster-brightness-max': 0.93,
          'raster-brightness-min': 0.08,
          'raster-contrast': -0.22,
          'raster-hue-rotate': 12,
          'raster-opacity': 0.72,
          'raster-saturation': -0.58,
        },
        source: 'osm',
        type: 'raster',
      },
      {
        id: 'paper-veil',
        paint: {
          'background-color': 'rgba(244, 226, 190, 0.18)',
        },
        type: 'background',
      },
    ],
    sources: {
      osm: createOsmRasterSource(),
    },
    version: 8,
  };
}

function createOsmRasterSource(): StyleSpecification['sources'][string] {
  return {
    attribution: OSM_ATTRIBUTION,
    tileSize: 256,
    tiles: [OSM_TILE_URL],
    type: 'raster',
  };
}
