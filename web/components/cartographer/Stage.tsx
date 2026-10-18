'use client';

import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { ArrowLeftIcon, ArrowRightIcon } from '@/components/ui/icons';
import { Button, Hint, Toggle, ToggleGroup } from '@/components/ui/radix-ui';

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
  selectedItemLabel,
  workspace = 'library',
}: StageProps) {
  const t = useTranslations('Stage');
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
        <nav aria-label={t('mapWorkspacePanels')} className="mobile-workspace-bar">
          <span
            className="mobile-workspace-selection"
            title={selectedItemLabel ?? t('noItemSelected')}
          >
            {selectedItemLabel ?? t('noItemSelected')}
          </span>
          <ToggleGroup
            aria-label={t('mapPanelView')}
            className="mobile-workspace-actions"
            type="single"
            value={mobilePanel}
            onValueChange={(nextPanel) => {
              if (nextPanel !== '') {
                onMobilePanelChange(nextPanel as MobileWorkspacePanel);
              }
            }}
          >
            <Toggle value="map">{t('map')}</Toggle>
            <Toggle value="picker">{t('choose')}</Toggle>
            <Toggle value="inspector">{t('details')}</Toggle>
          </ToggleGroup>
        </nav>
      )}
      {onToggleLeftPanel == null && onToggleRightPanel == null ? null : (
        <fieldset className="map-panel-controls map-panel-icon-controls">
          <legend className="sr-only">{t('mapPanelControls')}</legend>
          {onToggleLeftPanel == null ? null : (
            <Hint label={isLeftPanelCollapsed ? t('showItemPicker') : t('hideItemPicker')}>
              <Button
                aria-expanded={!isLeftPanelCollapsed}
                aria-label={isLeftPanelCollapsed ? t('showItemPicker') : t('hideItemPicker')}
                className={`map-panel-control map-panel-control-library ${
                  isLeftPanelCollapsed ? 'is-restore' : 'is-collapse'
                }`}
                data-label={t('itemPicker')}
                title={isLeftPanelCollapsed ? t('showItemPicker') : t('hideItemPicker')}
                type="button"
                onClick={onToggleLeftPanel}
              >
                {isLeftPanelCollapsed ? <ArrowRightIcon /> : <ArrowLeftIcon />}
              </Button>
            </Hint>
          )}
          {onToggleRightPanel == null ? null : (
            <Hint label={isRightPanelCollapsed ? t('showDetails') : t('hideDetails')}>
              <Button
                aria-expanded={!isRightPanelCollapsed}
                aria-label={isRightPanelCollapsed ? t('showDetails') : t('hideDetails')}
                className={`map-panel-control map-panel-control-editor ${
                  isRightPanelCollapsed ? 'is-restore' : 'is-collapse'
                }`}
                data-label={t('inspector')}
                title={isRightPanelCollapsed ? t('showDetails') : t('hideDetails')}
                type="button"
                onClick={onToggleRightPanel}
              >
                {isRightPanelCollapsed ? <ArrowLeftIcon /> : <ArrowRightIcon />}
              </Button>
            </Hint>
          )}
        </fieldset>
      )}
      {children}
    </main>
  );
}
