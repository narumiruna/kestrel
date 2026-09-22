'use client';

import { ChevronDownIcon, LayersIcon, MinusIcon, PlusIcon, SizeIcon } from '@/components/ui/icons';
import { Button, Hint, Menu, MenuSurface } from '@/components/ui/radix-ui';
import { useMapStyle } from '@/hooks/useMapStyle';

type ZoomStackProps = {
  onFit?: () => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
};

export function ZoomStack({ onFit, onZoomIn, onZoomOut }: ZoomStackProps) {
  const { availableStyles, label, setStyleName, styleName } = useMapStyle();

  return (
    <fieldset className="map-control-stack">
      <legend className="sr-only">Map tools</legend>
      <fieldset className="map-control-bar map-viewport-controls">
        <legend className="sr-only">Map viewport</legend>
        <Hint label="Zoom in">
          <Button aria-label="Zoom in" title="Zoom in" type="button" onClick={onZoomIn}>
            <PlusIcon />
          </Button>
        </Hint>
        <span aria-hidden className="map-control-divider" />
        <Hint label="Zoom out">
          <Button aria-label="Zoom out" title="Zoom out" type="button" onClick={onZoomOut}>
            <MinusIcon />
          </Button>
        </Hint>
        <span aria-hidden className="map-control-divider" />
        <Hint label="Fit to all pins">
          <Button
            aria-label="Fit to all pins"
            title="Fit to all pins"
            type="button"
            onClick={onFit}
          >
            <SizeIcon />
          </Button>
        </Hint>
      </fieldset>
      <fieldset className="map-style-control map-appearance-control">
        <legend className="sr-only">Map appearance</legend>
        <MenuSurface
          align="end"
          className="map-style-menu"
          side="top"
          trigger={
            <Button
              aria-label={`Map appearance: ${label}`}
              className="map-style-trigger"
              title={`Map appearance: ${label}`}
              type="button"
            >
              <LayersIcon />
              <span>{label}</span>
              <ChevronDownIcon />
            </Button>
          }
        >
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
