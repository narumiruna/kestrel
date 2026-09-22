'use client';

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
  isMapFocused?: boolean;
  onFit?: () => void;
  onToggleMapFocus?: () => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  viewportDisabled?: boolean;
};

export function ZoomStack({
  isMapFocused = false,
  onFit,
  onToggleMapFocus,
  onZoomIn,
  onZoomOut,
  viewportDisabled = false,
}: ZoomStackProps) {
  const { availableStyles, label, setStyleName, styleName } = useMapStyle();

  return (
    <fieldset className="map-control-stack">
      <legend className="sr-only">Map tools</legend>
      <fieldset className="map-control-bar map-viewport-controls">
        <legend className="sr-only">Map viewport</legend>
        <Hint label="Zoom in">
          <Button
            aria-label="Zoom in"
            disabled={viewportDisabled}
            title="Zoom in"
            type="button"
            onClick={onZoomIn}
          >
            <PlusIcon />
          </Button>
        </Hint>
        <span aria-hidden className="map-control-divider" />
        <Hint label="Zoom out">
          <Button
            aria-label="Zoom out"
            disabled={viewportDisabled}
            title="Zoom out"
            type="button"
            onClick={onZoomOut}
          >
            <MinusIcon />
          </Button>
        </Hint>
        <span aria-hidden className="map-control-divider" />
        <Hint label="Fit to all pins">
          <Button
            aria-label="Fit to all pins"
            disabled={viewportDisabled}
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
              aria-label={`Map tools, appearance: ${label}`}
              className="map-style-trigger"
              title={`Map tools, appearance: ${label}`}
              type="button"
            >
              <LayersIcon />
              <span>Map tools</span>
              <ChevronDownIcon />
            </Button>
          }
        >
          {onToggleMapFocus == null ? null : (
            <>
              <Menu.Item className="ui-menu-item map-focus-menu-item" onSelect={onToggleMapFocus}>
                {isMapFocused ? <ExitFullScreenIcon /> : <EnterFullScreenIcon />}
                {isMapFocused ? 'Show panels' : 'Focus map'}
              </Menu.Item>
              <Menu.Separator className="ui-menu-separator" />
            </>
          )}
          <Menu.Label className="ui-menu-label">Map appearance</Menu.Label>
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
