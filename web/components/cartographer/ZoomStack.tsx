'use client';

import { useTranslations } from 'next-intl';
import {
  ChevronDownIcon,
  EnterFullScreenIcon,
  ExitFullScreenIcon,
  LayersIcon,
  MinusIcon,
  PlusIcon,
  SizeIcon,
} from '@/components/ui/icons';
import { Button, Hint, Menu, MenuSurface } from '@/components/ui/radix-ui';
import { useMapStyle } from '@/hooks/useMapStyle';

type ZoomStackProps = {
  fitDisabled?: boolean;
  fitLabel?: string;
  isMapFocused?: boolean;
  onFit?: () => void;
  onToggleMapFocus?: () => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  viewportDisabled?: boolean;
};

export function ZoomStack({
  fitDisabled = false,
  fitLabel,
  isMapFocused = false,
  onFit,
  onToggleMapFocus,
  onZoomIn,
  onZoomOut,
  viewportDisabled = false,
}: ZoomStackProps) {
  const t = useTranslations('ZoomStack');
  const { availableStyles, label, setStyleName, styleName } = useMapStyle();

  return (
    <fieldset className="map-control-stack">
      <legend className="sr-only">{t('mapTools')}</legend>
      <fieldset className="map-control-bar map-viewport-controls">
        <legend className="sr-only">{t('mapViewport')}</legend>
        <Hint label={t('zoomIn')}>
          <Button
            aria-label={t('zoomIn')}
            disabled={viewportDisabled}
            title={t('zoomIn')}
            type="button"
            onClick={onZoomIn}
          >
            <PlusIcon />
          </Button>
        </Hint>
        <span aria-hidden className="map-control-divider" />
        <Hint label={t('zoomOut')}>
          <Button
            aria-label={t('zoomOut')}
            disabled={viewportDisabled}
            title={t('zoomOut')}
            type="button"
            onClick={onZoomOut}
          >
            <MinusIcon />
          </Button>
        </Hint>
        <span aria-hidden className="map-control-divider" />
        <Hint label={fitLabel ?? t('fitToAllPins')}>
          <Button
            aria-label={fitLabel ?? t('fitToAllPins')}
            disabled={viewportDisabled || fitDisabled}
            title={fitLabel ?? t('fitToAllPins')}
            type="button"
            onClick={onFit}
          >
            <SizeIcon />
          </Button>
        </Hint>
      </fieldset>
      <fieldset className="map-style-control map-appearance-control">
        <legend className="sr-only">{t('mapAppearance')}</legend>
        <MenuSurface
          align="end"
          className="map-style-menu"
          side="top"
          trigger={
            <Button
              aria-label={t('toolsAppearance', { label })}
              className="map-style-trigger"
              title={t('toolsAppearance', { label })}
              type="button"
            >
              <LayersIcon />
              <span>{t('mapTools')}</span>
              <ChevronDownIcon />
            </Button>
          }
        >
          {onToggleMapFocus == null ? null : (
            <>
              <Menu.Item className="ui-menu-item map-focus-menu-item" onSelect={onToggleMapFocus}>
                {isMapFocused ? <ExitFullScreenIcon /> : <EnterFullScreenIcon />}
                {isMapFocused ? t('showPanels') : t('focusMap')}
              </Menu.Item>
              <Menu.Separator className="ui-menu-separator" />
            </>
          )}
          <Menu.Label className="ui-menu-label">{t('mapAppearance')}</Menu.Label>
          <Menu.RadioGroup
            value={styleName}
            onValueChange={(value) => setStyleName(value as typeof styleName)}
          >
            {availableStyles.map((styleOption) => (
              <Menu.RadioItem
                className="ui-menu-item"
                key={styleOption.name}
                value={styleOption.name}
              >
                {styleOption.label}
              </Menu.RadioItem>
            ))}
          </Menu.RadioGroup>
        </MenuSurface>
      </fieldset>
    </fieldset>
  );
}
