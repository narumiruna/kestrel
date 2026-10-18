export type MapLabelKey =
  | 'map'
  | 'zoomIn'
  | 'zoomOut'
  | 'resetBearing'
  | 'fullscreen'
  | 'exitFullscreen'
  | 'attribution'
  | 'feedback'
  | 'findLocation'
  | 'locationUnavailable'
  | 'marker'
  | 'closePopup';
export type MapLabelTranslator = (key: MapLabelKey) => string;
export function mapLibreLocale(t: MapLabelTranslator): Record<string, string> {
  return {
    'Map.Title': t('map'),
    'Marker.Title': t('marker'),
    'NavigationControl.ZoomIn': t('zoomIn'),
    'NavigationControl.ZoomOut': t('zoomOut'),
    'NavigationControl.ResetBearing': t('resetBearing'),
    'AttributionControl.ToggleAttribution': t('attribution'),
    'AttributionControl.MapFeedback': t('feedback'),
    'FullscreenControl.Enter': t('fullscreen'),
    'FullscreenControl.Exit': t('exitFullscreen'),
    'GeolocateControl.FindMyLocation': t('findLocation'),
    'GeolocateControl.LocationNotAvailable': t('locationUnavailable'),
    'Popup.Close': t('closePopup'),
  };
}
export function updateMapLabels(container: HTMLElement, t: MapLabelTranslator) {
  container.querySelector('canvas')?.setAttribute('aria-label', t('map'));
  for (const selector of ['.maplibregl-ctrl-attrib-button']) {
    const button = container.querySelector<HTMLElement>(selector);
    button?.setAttribute('aria-label', t('attribution'));
    button?.setAttribute('title', t('attribution'));
  }
  const feedback = container.querySelector('.maplibregl-ctrl-attrib a.mapbox-improve-map');
  if (feedback) feedback.textContent = t('feedback');
}
