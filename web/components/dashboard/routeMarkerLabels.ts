type Point = { x: number; y: number };

/** Reserve square screen-space areas, matching the markers' square hit targets. */
export function getVisibleRouteLabels(
  points: Point[],
  selectedIndex: number | null,
  hoveredIndex: number | null,
  spacing = 48,
): Set<number> {
  const visible = new Set<number>();
  const cells = new Map<string, Point[]>();

  function add(index: number) {
    const point = points[index];
    if (point == null || visible.has(index)) return;
    visible.add(index);
    const key = `${Math.floor(point.x / spacing)},${Math.floor(point.y / spacing)}`;
    const cell = cells.get(key) ?? [];
    cell.push(point);
    cells.set(key, cell);
  }

  // Important labels may overlap, but never disappear during selection or keyboard focus.
  for (const index of [selectedIndex, hoveredIndex, 0, points.length - 1]) {
    if (index != null) add(index);
  }

  points.forEach((point, index) => {
    if (visible.has(index)) return;
    const x = Math.floor(point.x / spacing);
    const y = Math.floor(point.y / spacing);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (
          cells
            .get(`${x + dx},${y + dy}`)
            ?.some(
              (other) =>
                Math.max(Math.abs(point.x - other.x), Math.abs(point.y - other.y)) < spacing,
            )
        ) {
          return;
        }
      }
    }
    add(index);
  });

  return visible;
}
