type Point = { x: number; y: number };

const HIT_TARGET_SIZE = 44;
const OFFSET_STEP = 48;
const OFFSET_DIRECTIONS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [-1, 1],
  [1, -1],
  [-1, -1],
];

/** Separate priority targets visually without changing their geographic coordinates. */
export function getRouteMarkerLayout(
  points: Point[],
  selectedIndex: number | null,
  hoveredIndex: number | null,
  viewport?: { width: number; height: number },
) {
  const offsets = points.map(() => ({ x: 0, y: 0 }));
  const displayPoints = points.map((point) => ({ ...point }));
  const reserved: Point[] = [];
  const priorityIndices = new Set([0, points.length - 1, selectedIndex, hoveredIndex]);
  const unplaced = new Set<number>();
  const halfSize = HIT_TARGET_SIZE / 2;
  const fits = (point: Point) =>
    viewport == null ||
    (point.x >= halfSize &&
      point.x <= viewport.width - halfSize &&
      point.y >= halfSize &&
      point.y <= viewport.height - halfSize);
  const isFree = (point: Point) =>
    fits(point) &&
    !reserved.some(
      (other) =>
        Math.max(Math.abs(point.x - other.x), Math.abs(point.y - other.y)) < HIT_TARGET_SIZE,
    );

  for (const index of priorityIndices) {
    if (index == null || points[index] == null) continue;
    const anchor = points[index];
    // Offscreen waypoints stay offscreen; don't pull them into the viewport while panning.
    if (
      viewport != null &&
      (anchor.x < 0 || anchor.x > viewport.width || anchor.y < 0 || anchor.y > viewport.height)
    ) {
      unplaced.add(index);
      continue;
    }
    const origin =
      viewport == null
        ? anchor
        : {
            x: Math.max(halfSize, Math.min(viewport.width - halfSize, anchor.x)),
            y: Math.max(halfSize, Math.min(viewport.height - halfSize, anchor.y)),
          };
    let placement: Point | null = isFree(origin) ? origin : null;
    // At most four priority markers: bounded search, preferring the smallest displacement.
    for (let ring = 1; placement == null && ring <= priorityIndices.size; ring++) {
      for (const [dx, dy] of OFFSET_DIRECTIONS) {
        const candidate = {
          x: origin.x + dx * ring * OFFSET_STEP,
          y: origin.y + dy * ring * OFFSET_STEP,
        };
        if (isFree(candidate)) {
          placement = candidate;
          break;
        }
      }
    }
    if (placement == null) {
      // A tiny canvas may not fit all targets; keep the waypoint list as the safe fallback.
      unplaced.add(index);
      continue;
    }
    displayPoints[index] = placement;
    offsets[index] = { x: placement.x - anchor.x, y: placement.y - anchor.y };
    reserved.push(placement);
  }

  const visiblePoints = getVisibleRouteLabels(
    displayPoints,
    selectedIndex,
    hoveredIndex,
    HIT_TARGET_SIZE,
  );
  for (const index of visiblePoints) {
    if (unplaced.has(index) || !fits(displayPoints[index])) visiblePoints.delete(index);
  }
  return {
    offsets,
    visiblePoints,
    visibleLabels: getVisibleRouteLabels(displayPoints, selectedIndex, hoveredIndex),
  };
}

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
