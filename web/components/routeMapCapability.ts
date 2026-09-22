export type RouteMapCapability = 'loading' | 'ready' | 'route-preview-error' | 'unavailable';

export function canEditRouteOnMap(capability: RouteMapCapability): boolean {
  return capability === 'ready';
}

export function getRouteMapInstruction(capability: RouteMapCapability): string {
  switch (capability) {
    case 'loading':
      return 'Map loading. Add a saved place or exact coordinates while you wait.';
    case 'ready':
      return 'Click the map, choose a saved place, or enter exact coordinates.';
    case 'route-preview-error':
      return 'Route preview unavailable. Use saved places, exact coordinates, or Manage all waypoints.';
    case 'unavailable':
      return 'Map unavailable. Use saved places, exact coordinates, or Manage all waypoints.';
  }
}
