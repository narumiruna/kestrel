'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';

type StageProps = {
  children: ReactNode;
  isLeftPanelCollapsed?: boolean;
  isRightPanelCollapsed?: boolean;
  map: ReactNode;
  mode: 'places' | 'routes';
  workspace?: 'library' | 'map';
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
  workspace = 'library',
}: StageProps) {
  const className = [
    'cartographer-stage',
    `cartographer-stage-${mode}`,
    `cartographer-stage-${workspace}`,
    isLeftPanelCollapsed ? 'cartographer-stage-left-collapsed' : '',
    isRightPanelCollapsed ? 'cartographer-stage-right-collapsed' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const isMapFocused = isLeftPanelCollapsed && isRightPanelCollapsed;
  const libraryHref = `/dashboard/library/${mode}`;

  return (
    <main className={className}>
      <div className="cartographer-map-layer">{map}</div>
      <div aria-hidden className="cartographer-paper-vignette" />
      <nav className="workspace-tabs" aria-label="Workspace tabs">
        <Link
          aria-current={workspace === 'map' ? 'page' : undefined}
          className={workspace === 'map' ? 'active' : ''}
          href="/dashboard/map"
        >
          Map
        </Link>
        <Link
          aria-current={workspace === 'library' ? 'page' : undefined}
          className={workspace === 'library' ? 'active' : ''}
          href={libraryHref}
        >
          Library
        </Link>
      </nav>
      {onToggleLeftPanel == null &&
      onToggleRightPanel == null &&
      onToggleMapFocus == null ? null : (
        <fieldset className="map-panel-controls map-panel-icon-controls">
          <legend className="sr-only">Map panel controls</legend>
          {onToggleLeftPanel == null ? null : (
            <button
              aria-expanded={!isLeftPanelCollapsed}
              aria-label={isLeftPanelCollapsed ? 'Show Library' : 'Hide Library'}
              className={`map-panel-control map-panel-control-library ${
                isLeftPanelCollapsed ? 'is-restore' : 'is-collapse'
              }`}
              data-label="Library"
              title={isLeftPanelCollapsed ? 'Show Library' : 'Hide Library'}
              type="button"
              onClick={onToggleLeftPanel}
            >
              {isLeftPanelCollapsed ? 'L' : '−'}
            </button>
          )}
          {onToggleRightPanel == null ? null : (
            <button
              aria-expanded={!isRightPanelCollapsed}
              aria-label={isRightPanelCollapsed ? 'Show Editor' : 'Hide Editor'}
              className={`map-panel-control map-panel-control-editor ${
                isRightPanelCollapsed ? 'is-restore' : 'is-collapse'
              }`}
              data-label="Editor"
              title={isRightPanelCollapsed ? 'Show Editor' : 'Hide Editor'}
              type="button"
              onClick={onToggleRightPanel}
            >
              {isRightPanelCollapsed ? 'E' : '−'}
            </button>
          )}
          {onToggleMapFocus == null ? null : (
            <button
              aria-label={isMapFocused ? 'Show panels' : 'Focus map'}
              aria-pressed={isMapFocused}
              className={`map-panel-control map-panel-control-focus ${isMapFocused ? 'active' : ''}`}
              data-label="Focus map"
              title={isMapFocused ? 'Show panels' : 'Focus map'}
              type="button"
              onClick={onToggleMapFocus}
            >
              F
            </button>
          )}
        </fieldset>
      )}
      {children}
    </main>
  );
}
