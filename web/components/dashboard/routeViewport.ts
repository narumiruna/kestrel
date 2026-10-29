export type ViewportRect = { left: number; top: number; right: number; bottom: number };
type Point = { latitude: number; longitude: number };

/** Reserve only space that overlaps the map. Desktop panels normally sit outside it. */
export function getRouteViewportPadding(viewport: ViewportRect, obstacles: ViewportRect[]) {
  const width = Math.max(1, viewport.right - viewport.left);
  const height = Math.max(1, viewport.bottom - viewport.top);
  const gap = Math.min(48, width / 5, height / 5);
  const padding = { top: gap, bottom: gap, left: gap, right: gap };
  for (const obstacle of obstacles) {
    const left = Math.max(viewport.left, obstacle.left);
    const right = Math.min(viewport.right, obstacle.right);
    const top = Math.max(viewport.top, obstacle.top);
    const bottom = Math.min(viewport.bottom, obstacle.bottom);
    if (right <= left || bottom <= top) continue;
    // Side panels reserve width; small tools reserve their nearest vertical edge.
    if (bottom - top > height / 2 && right - left < width / 2) {
      if (left - viewport.left < viewport.right - right) {
        padding.left = Math.max(padding.left, right - viewport.left + gap);
      } else {
        padding.right = Math.max(padding.right, viewport.right - left + gap);
      }
    } else if (top - viewport.top < viewport.bottom - bottom) {
      padding.top = Math.max(padding.top, bottom - viewport.top + gap);
    } else {
      padding.bottom = Math.max(padding.bottom, viewport.bottom - top + gap);
    }
  }
  // Keep a positive camera viewport even in small map previews.
  const horizontalScale = Math.min(1, (width - 1) / (padding.left + padding.right));
  const verticalScale = Math.min(1, (height - 1) / (padding.top + padding.bottom));
  padding.left *= horizontalScale;
  padding.right *= horizontalScale;
  padding.top *= verticalScale;
  padding.bottom *= verticalScale;
  return padding;
}

/** Unwrap only at the renderer boundary; stored coordinates remain within ±180°. */
export function getRouteCoordinates(points: Point[]): [number, number][] {
  let longitude = points[0]?.longitude ?? 0;
  return points.map((point) => {
    longitude = point.longitude + 360 * Math.round((longitude - point.longitude) / 360);
    return [longitude, point.latitude];
  });
}

export function getRouteBounds(points: Point[]): [[number, number], [number, number]] | null {
  if (points.length === 0) return null;
  const coordinates = getRouteCoordinates(points);
  let west = coordinates[0][0];
  let east = west;
  let south = coordinates[0][1];
  let north = south;
  for (const [longitude, latitude] of coordinates) {
    west = Math.min(west, longitude);
    east = Math.max(east, longitude);
    south = Math.min(south, latitude);
    north = Math.max(north, latitude);
  }
  return [
    [west, south],
    [east, north],
  ];
}
