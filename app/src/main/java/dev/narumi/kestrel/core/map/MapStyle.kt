package dev.narumi.kestrel.core.map

internal const val OSM_RASTER_STYLE_JSON = """
{
  "version": 8,
  "sources": {
    "osm": {
      "type": "raster",
      "tiles": ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      "tileSize": 256,
      "attribution": "© OpenStreetMap contributors"
    }
  },
  "layers": [
    { "id": "background", "type": "background", "paint": { "background-color": "#e5e3df" } },
    { "id": "osm", "type": "raster", "source": "osm" }
  ]
}
"""
