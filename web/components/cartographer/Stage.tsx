import type { ReactNode } from 'react';

type StageProps = {
  children: ReactNode;
  isLeftPanelCollapsed?: boolean;
  isRightPanelCollapsed?: boolean;
  map: ReactNode;
  mode: 'places' | 'routes';
  onToggleLeftPanel?: () => void;
  onToggleMapFocus?: () => void;
  onToggleRightPanel?: () => void;
};

export function Stage({
  children,
  isLeftPanelCollapsed = false,
  isRightPanelCollapsed = false,
  map,
  mode,
  onToggleLeftPanel,
  onToggleMapFocus,
  onToggleRightPanel,
}: StageProps) {
  const className = [
    'cartographer-stage',
    `cartographer-stage-${mode}`,
    isLeftPanelCollapsed ? 'cartographer-stage-left-collapsed' : '',
    isRightPanelCollapsed ? 'cartographer-stage-right-collapsed' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const isMapFocused = isLeftPanelCollapsed && isRightPanelCollapsed;

  return (
    <main className={className}>
      <div className="cartographer-map-layer">{map}</div>
      <div aria-hidden className="cartographer-paper-vignette" />
      {onToggleLeftPanel == null &&
      onToggleRightPanel == null &&
      onToggleMapFocus == null ? null : (
        <fieldset className="map-panel-controls">
          <legend className="sr-only">Map panel controls</legend>
          {onToggleLeftPanel == null ? null : (
            <button
              aria-expanded={!isLeftPanelCollapsed}
              className="secondary"
              type="button"
              onClick={onToggleLeftPanel}
            >
              {isLeftPanelCollapsed ? 'Show library' : 'Hide library'}
            </button>
          )}
          {onToggleRightPanel == null ? null : (
            <button
              aria-expanded={!isRightPanelCollapsed}
              className="secondary"
              type="button"
              onClick={onToggleRightPanel}
            >
              {isRightPanelCollapsed ? 'Show editor' : 'Hide editor'}
            </button>
          )}
          {onToggleMapFocus == null ? null : (
            <button className="secondary" type="button" onClick={onToggleMapFocus}>
              {isMapFocused ? 'Show panels' : 'Focus map'}
            </button>
          )}
        </fieldset>
      )}
      {children}
    </main>
  );
}
