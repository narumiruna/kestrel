import type { StyleSpecification } from 'maplibre-gl';

export type MapStyleName = 'dark' | 'field-notebook' | 'plain' | 'satellite' | 'terrain';

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
    label: 'Notebook',
    name: 'field-notebook',
  },
  {
    description: 'Plain OSM raster tiles for troubleshooting and maximum familiarity.',
    label: 'Plain',
    name: 'plain',
  },
  {
    description: 'No-key public satellite imagery for photo context.',
    label: 'Satellite',
    name: 'satellite',
  },
  {
    description: 'Warm terrain-inspired OSM raster styling without a keyed provider.',
    label: 'Terrain',
    name: 'terrain',
  },
  {
    description: 'Warm dusk OSM raster styling without a keyed provider.',
    label: 'Dark',
    name: 'dark',
  },
];

export function getAvailableMapStyles() {
  return MAP_STYLE_OPTIONS;
}

export function isMapStyleName(value: string | null): value is MapStyleName {
  return (
    value === 'dark' ||
    value === 'field-notebook' ||
    value === 'plain' ||
    value === 'satellite' ||
    value === 'terrain'
  );
}

export function getNextMapStyleName(styleName: MapStyleName): MapStyleName {
  const currentIndex = MAP_STYLE_OPTIONS.findIndex((option) => option.name === styleName);
  const nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % MAP_STYLE_OPTIONS.length;

  return MAP_STYLE_OPTIONS[nextIndex].name;
}

export function getMapStyleLabel(styleName: MapStyleName): string {
  return MAP_STYLE_OPTIONS.find((option) => option.name === styleName)?.label ?? 'Map';
}

export function getStyleByName(styleName: MapStyleName): StyleSpecification {
  if (styleName === 'plain') {
    return createPlainMapStyle();
  }

  if (styleName === 'satellite') {
    return createSatelliteMapStyle();
  }

  if (styleName === 'terrain') {
    return createTerrainMapStyle();
  }

  if (styleName === 'dark') {
    return createDarkMapStyle();
  }

  return createFieldNotebookMapStyle();
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

export function createSatelliteMapStyle(): StyleSpecification {
  return {
    glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
    layers: [
      {
        id: 'satellite-imagery',
        source: 'satellite',
        type: 'raster',
      },
    ],
    sources: {
      satellite: {
        attribution:
          'Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community',
        tileSize: 256,
        tiles: [
          'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        ],
        type: 'raster',
      },
    },
    version: 8,
  };
}

export function createTerrainMapStyle(): StyleSpecification {
  return {
    glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
    layers: [
      {
        id: 'terrain-paper',
        paint: {
          'background-color': '#e9d7af',
        },
        type: 'background',
      },
      {
        id: 'osm-terrain-wash',
        paint: {
          'raster-brightness-max': 0.86,
          'raster-brightness-min': 0.12,
          'raster-contrast': 0.08,
          'raster-hue-rotate': 26,
          'raster-opacity': 0.82,
          'raster-saturation': -0.2,
        },
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

export function createDarkMapStyle(): StyleSpecification {
  return {
    glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
    layers: [
      {
        id: 'dusk-paper',
        paint: {
          'background-color': '#241c16',
        },
        type: 'background',
      },
      {
        id: 'osm-dusk-wash',
        paint: {
          'raster-brightness-max': 0.48,
          'raster-brightness-min': 0.02,
          'raster-contrast': -0.08,
          'raster-hue-rotate': 24,
          'raster-opacity': 0.92,
          'raster-saturation': -0.5,
        },
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
