'use client';

import Link from 'next/link';
import type { MouseEvent, ReactNode } from 'react';
import { Button, Toggle, ToggleGroup } from '@/components/ui/radix-ui';

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
  onBeforeWorkspaceChange?: (href: string) => boolean;
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
    if (onBeforeWorkspaceChange?.(event.currentTarget.getAttribute('href') ?? '/') === false) {
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
          <ToggleGroup
            aria-label="Map panel view"
            className="mobile-workspace-actions"
            value={[mobilePanel]}
            onValueChange={(values) => {
              const nextPanel = values.at(-1) as MobileWorkspacePanel | undefined;
              if (nextPanel != null) {
                onMobilePanelChange(nextPanel);
              }
            }}
          >
            <Toggle value="map">Map</Toggle>
            <Toggle value="picker">Choose</Toggle>
            <Toggle value="inspector">Edit</Toggle>
          </ToggleGroup>
        </nav>
      )}
      {onToggleLeftPanel == null &&
      onToggleRightPanel == null &&
      onToggleMapFocus == null ? null : (
        <fieldset className="map-panel-controls map-panel-icon-controls">
          <legend className="sr-only">Map panel controls</legend>
          {onToggleLeftPanel == null ? null : (
            <Button
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
            </Button>
          )}
          {onToggleRightPanel == null ? null : (
            <Button
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
            </Button>
          )}
          {onToggleMapFocus == null ? null : (
            <Button
              aria-label={isMapFocused ? 'Show map panels' : 'Focus map'}
              aria-pressed={isMapFocused}
              className={`map-panel-control map-panel-control-focus ${isMapFocused ? 'active' : ''}`}
              data-label={isMapFocused ? 'Show panels' : 'Focus map'}
              title={isMapFocused ? 'Show map panels' : 'Focus map'}
              type="button"
              onClick={onToggleMapFocus}
            >
              <FocusIcon compressed={isMapFocused} />
            </Button>
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
