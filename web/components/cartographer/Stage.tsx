'use client';

import type { ReactNode } from 'react';
import { BorderLeftIcon, BorderRightIcon } from '@/components/ui/icons';
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
  onMobilePanelChange?: (panel: MobileWorkspacePanel) => void;
  onToggleLeftPanel?: () => void;
  onToggleRightPanel?: () => void;
};

export function Stage({
  children,
  isLeftPanelCollapsed = false,
  isRightPanelCollapsed = false,
  map,
  mobilePanel = 'map',
  mode,
  onMobilePanelChange,
  onToggleLeftPanel,
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
  return (
    <main className={className}>
      <div className="cartographer-map-layer">{map}</div>
      <div aria-hidden className="cartographer-paper-vignette" />
      {onMobilePanelChange == null ? null : (
        <nav aria-label="Map workspace panels" className="mobile-workspace-bar">
          <span className="mobile-workspace-selection" title={selectedItemLabel}>
            {selectedItemLabel}
          </span>
          <ToggleGroup
            aria-label="Map panel view"
            className="mobile-workspace-actions"
            type="single"
            value={mobilePanel}
            onValueChange={(nextPanel) => {
              if (nextPanel !== '') {
                onMobilePanelChange(nextPanel as MobileWorkspacePanel);
              }
            }}
          >
            <Toggle value="map">Map</Toggle>
            <Toggle value="picker">Choose</Toggle>
            <Toggle value="inspector">Edit</Toggle>
          </ToggleGroup>
        </nav>
      )}
      {onToggleLeftPanel == null && onToggleRightPanel == null ? null : (
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
              <BorderLeftIcon />
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
              <BorderRightIcon />
            </Button>
          )}
        </fieldset>
      )}
      {children}
    </main>
  );
}
