type CameraRequests = {
  hasFitRequest: boolean;
  hasFocusRequest: boolean;
  isReady: boolean;
  shouldRefitAfterResize: boolean;
};

/** Keep requests pending while loading; a complete-route fit also reveals its selected point. */
export function getRouteCameraAction(requests: CameraRequests): 'fit' | 'focus' | null {
  if (!requests.isReady) return null;
  if (requests.hasFitRequest || requests.shouldRefitAfterResize) return 'fit';
  return requests.hasFocusRequest ? 'focus' : null;
}
