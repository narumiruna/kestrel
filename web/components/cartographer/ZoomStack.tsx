'use client';

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
            <MaximizeIcon />
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
              <MapIcon />
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

function PlusIcon() {
  return (
    <svg aria-hidden="true" className="lucide-icon" fill="none" viewBox="0 0 24 24">
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

function MinusIcon() {
  return (
    <svg aria-hidden="true" className="lucide-icon" fill="none" viewBox="0 0 24 24">
      <path d="M5 12h14" />
    </svg>
  );
}

function MaximizeIcon() {
  return (
    <svg aria-hidden="true" className="lucide-icon" fill="none" viewBox="0 0 24 24">
      <path d="M8 3H5a2 2 0 0 0-2 2v3" />
      <path d="M16 3h3a2 2 0 0 1 2 2v3" />
      <path d="M8 21H5a2 2 0 0 1-2-2v-3" />
      <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
    </svg>
  );
}

function MapIcon() {
  return (
    <svg aria-hidden="true" className="lucide-icon" fill="none" viewBox="0 0 24 24">
      <path d="M14.5 4.5 9.5 2 3 5.5v16l6.5-3.5 5 2.5 6.5-3.5v-16z" />
      <path d="M9.5 2v16" />
      <path d="M14.5 4.5v16" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg aria-hidden="true" className="lucide-icon" fill="none" viewBox="0 0 24 24">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
