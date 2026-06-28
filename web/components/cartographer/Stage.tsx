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
