'use client';

import { useEffect, useRef, useState } from 'react';
import { useMapStyle } from '@/hooks/useMapStyle';

type ZoomStackProps = {
  onFit?: () => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
};

export function ZoomStack({ onFit, onZoomIn, onZoomOut }: ZoomStackProps) {
  const { availableStyles, label, setStyleName, styleName } = useMapStyle();
  const [isStyleMenuOpen, setIsStyleMenuOpen] = useState(false);
  const styleControlRef = useRef<HTMLFieldSetElement | null>(null);

  useEffect(() => {
    if (!isStyleMenuOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (styleControlRef.current?.contains(event.target as Node) === true) {
        return;
      }

      setIsStyleMenuOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsStyleMenuOpen(false);
      }
    }

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isStyleMenuOpen]);

  return (
    <fieldset className="map-control-stack">
      <legend className="sr-only">Map tools</legend>
      <fieldset className="map-control-bar map-viewport-controls">
        <legend className="sr-only">Map viewport</legend>
        <button aria-label="Zoom in" title="Zoom in" type="button" onClick={onZoomIn}>
          <PlusIcon />
        </button>
        <span aria-hidden className="map-control-divider" />
        <button aria-label="Zoom out" title="Zoom out" type="button" onClick={onZoomOut}>
          <MinusIcon />
        </button>
        <span aria-hidden className="map-control-divider" />
        <button aria-label="Fit to all pins" title="Fit to all pins" type="button" onClick={onFit}>
          <MaximizeIcon />
        </button>
      </fieldset>
      <fieldset className="map-style-control map-appearance-control" ref={styleControlRef}>
        <legend className="sr-only">Map appearance</legend>
        <button
          aria-expanded={isStyleMenuOpen}
          aria-haspopup="menu"
          aria-label={`Map appearance: ${label}`}
          className="map-style-trigger"
          title={`Map appearance: ${label}`}
          type="button"
          onClick={() => setIsStyleMenuOpen((current) => !current)}
        >
          <MapIcon />
          <span>{label}</span>
          <ChevronDownIcon />
        </button>
        {isStyleMenuOpen ? (
          <div aria-label="Map styles" className="map-style-menu" role="menu">
            {availableStyles.map((styleOption) => (
              <button
                aria-checked={styleOption.name === styleName}
                className={styleOption.name === styleName ? 'active' : ''}
                key={styleOption.name}
                role="menuitemradio"
                type="button"
                onClick={() => {
                  setStyleName(styleOption.name);
                  setIsStyleMenuOpen(false);
                }}
              >
                <span aria-hidden className="map-style-check">
                  {styleOption.name === styleName ? '✓' : ''}
                </span>
                {styleOption.label}
              </button>
            ))}
          </div>
        ) : null}
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
