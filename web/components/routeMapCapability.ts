export type RouteMapCapability = 'loading' | 'ready' | 'route-preview-error' | 'unavailable';

export function canEditRouteOnMap(capability: RouteMapCapability): boolean {
  return capability === 'ready';
}

export function getRouteViewportControlState(
  capability: RouteMapCapability,
  waypointCount: number,
) {
  const viewportDisabled = !canEditRouteOnMap(capability);
  return {
    fitDisabled: viewportDisabled || waypointCount === 0,
    viewportDisabled,
  };
}

export function getRouteMapInstruction(
  capability: RouteMapCapability,
  t: (key: 'loading' | 'ready' | 'previewError' | 'unavailable') => string,
): string {
  switch (capability) {
    case 'loading':
      return t('loading');
    case 'ready':
      return t('ready');
    case 'route-preview-error':
      return t('previewError');
    case 'unavailable':
      return t('unavailable');
  }
}
