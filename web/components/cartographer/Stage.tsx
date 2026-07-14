'use client';

import Link from 'next/link';
import type { MouseEvent, ReactNode } from 'react';

export type MobileWorkspacePanel = 'inspector' | 'map' | 'picker';

type StageProps = {
  children: ReactNode;
  isLeftPanelCollapsed?: boolean;
  isRightPanelCollapsed?: boolean;
  map: ReactNode;
  mobilePanel?: MobileWorkspacePanel;
  mode: 'places' | 'routes';
  selectedItemLabel?: string;
  workspace?: 'library' | 'map';
  onBeforeWorkspaceChange?: () => boolean;
  onMobilePanelChange?: (panel: MobileWorkspacePanel) => void;
  onToggleLeftPanel?: () => void;
  onToggleMapFocus?: () => void;
  onToggleRightPanel?: () => void;
};

export function Stage({
  children,
  isLeftPanelCollapsed = false,
  isRightPanelCollapsed = false,
  map,
  mobilePanel = 'map',
  mode,
  onBeforeWorkspaceChange,
  onMobilePanelChange,
  onToggleLeftPanel,
  onToggleMapFocus,
  onToggleRightPanel,
  selectedItemLabel = 'No item selected',
  workspace = 'library',
}: StageProps) {
  const className = [
    'cartographer-stage',
    `cartographer-stage-${mode}`,
    `cartographer-stage-${workspace}`,
    `cartographer-stage-mobile-${mobilePanel}`,
    isLeftPanelCollapsed ? 'cartographer-stage-left-collapsed' : '',
    isRightPanelCollapsed ? 'cartographer-stage-right-collapsed' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const isMapFocused = isLeftPanelCollapsed && isRightPanelCollapsed;
  const libraryHref = '/dashboard/library';

  function handleWorkspaceChange(event: MouseEvent<HTMLAnchorElement>) {
    if (onBeforeWorkspaceChange?.() === false) {
      event.preventDefault();
    }
  }

  return (
    <main className={className}>
      <div className="cartographer-map-layer">{map}</div>
      <div aria-hidden className="cartographer-paper-vignette" />
      <nav className="workspace-tabs" aria-label="Workspace tabs">
        <Link
          aria-current={workspace === 'map' ? 'page' : undefined}
          className={workspace === 'map' ? 'active' : ''}
          href="/dashboard/map"
          onClick={handleWorkspaceChange}
        >
          Map
        </Link>
        <Link
          aria-current={workspace === 'library' ? 'page' : undefined}
          className={workspace === 'library' ? 'active' : ''}
          href={libraryHref}
          onClick={handleWorkspaceChange}
        >
          Library
        </Link>
      </nav>
      {onMobilePanelChange == null ? null : (
        <nav aria-label="Map workspace panels" className="mobile-workspace-bar">
          <span className="mobile-workspace-selection" title={selectedItemLabel}>
            {selectedItemLabel}
          </span>
          <span className="mobile-workspace-actions">
            <button
              aria-pressed={mobilePanel === 'map'}
              className={mobilePanel === 'map' ? 'active' : ''}
              type="button"
              onClick={() => onMobilePanelChange('map')}
            >
              Map
            </button>
            <button
              aria-pressed={mobilePanel === 'picker'}
              className={mobilePanel === 'picker' ? 'active' : ''}
              type="button"
              onClick={() => onMobilePanelChange('picker')}
            >
              Choose
            </button>
            <button
              aria-pressed={mobilePanel === 'inspector'}
              className={mobilePanel === 'inspector' ? 'active' : ''}
              type="button"
              onClick={() => onMobilePanelChange('inspector')}
            >
              Edit
            </button>
          </span>
        </nav>
      )}
      {onToggleLeftPanel == null &&
      onToggleRightPanel == null &&
      onToggleMapFocus == null ? null : (
        <fieldset className="map-panel-controls map-panel-icon-controls">
          <legend className="sr-only">Map panel controls</legend>
          {onToggleLeftPanel == null ? null : (
            <button
              aria-expanded={!isLeftPanelCollapsed}
              aria-label={isLeftPanelCollapsed ? 'Show item picker' : 'Hide item picker'}
              className={`map-panel-control map-panel-control-library ${
                isLeftPanelCollapsed ? 'is-restore' : 'is-collapse'
              }`}
              data-label="Item picker"
              title={isLeftPanelCollapsed ? 'Show item picker' : 'Hide item picker'}
              type="button"
              onClick={onToggleLeftPanel}
            >
              <PanelLeftIcon collapsed={isLeftPanelCollapsed} />
            </button>
          )}
          {onToggleRightPanel == null ? null : (
            <button
              aria-expanded={!isRightPanelCollapsed}
              aria-label={isRightPanelCollapsed ? 'Show inspector' : 'Hide inspector'}
              className={`map-panel-control map-panel-control-editor ${
                isRightPanelCollapsed ? 'is-restore' : 'is-collapse'
              }`}
              data-label="Inspector"
              title={isRightPanelCollapsed ? 'Show inspector' : 'Hide inspector'}
              type="button"
              onClick={onToggleRightPanel}
            >
              <PanelRightIcon collapsed={isRightPanelCollapsed} />
            </button>
          )}
          {onToggleMapFocus == null ? null : (
            <button
              aria-label={isMapFocused ? 'Show map panels' : 'Focus map'}
              aria-pressed={isMapFocused}
              className={`map-panel-control map-panel-control-focus ${isMapFocused ? 'active' : ''}`}
              data-label={isMapFocused ? 'Show panels' : 'Focus map'}
              title={isMapFocused ? 'Show map panels' : 'Focus map'}
              type="button"
              onClick={onToggleMapFocus}
            >
              <FocusIcon compressed={isMapFocused} />
            </button>
          )}
        </fieldset>
      )}
      {children}
    </main>
  );
}

function PanelLeftIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg aria-hidden="true" className="lucide-icon" fill="none" viewBox="0 0 24 24">
      <rect height="18" rx="2" width="18" x="3" y="3" />
      <path d="M9 3v18" />
      <path d={collapsed ? 'm13 9 3 3-3 3' : 'm16 9-3 3 3 3'} />
    </svg>
  );
}

function PanelRightIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg aria-hidden="true" className="lucide-icon" fill="none" viewBox="0 0 24 24">
      <rect height="18" rx="2" width="18" x="3" y="3" />
      <path d="M15 3v18" />
      <path d={collapsed ? 'm11 9-3 3 3 3' : 'm8 9 3 3-3 3'} />
    </svg>
  );
}

function FocusIcon({ compressed }: { compressed: boolean }) {
  return (
    <svg aria-hidden="true" className="lucide-icon" fill="none" viewBox="0 0 24 24">
      {compressed ? (
        <>
          <path d="M9 3v6H3" />
          <path d="M15 3v6h6" />
          <path d="M9 21v-6H3" />
          <path d="M15 21v-6h6" />
        </>
      ) : (
        <>
          <path d="M8 3H3v5" />
          <path d="M16 3h5v5" />
          <path d="M8 21H3v-5" />
          <path d="M16 21h5v-5" />
        </>
      )}
    </svg>
  );
}
