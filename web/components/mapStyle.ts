import type { StyleSpecification } from 'maplibre-gl';

export const DEFAULT_MAP_CENTER = {
  latitude: 25.033,
  longitude: 121.5654,
};

export function createRasterMapStyle(): StyleSpecification {
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
      osm: {
        attribution: '© OpenStreetMap contributors',
        tileSize: 256,
        tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
        type: 'raster',
      },
    },
    version: 8,
  };
}
