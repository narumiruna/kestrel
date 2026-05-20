'use client';

import { useMapStyle } from '@/hooks/useMapStyle';

type ZoomStackProps = {
  onFit?: () => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
};

export function ZoomStack({ onFit, onZoomIn, onZoomOut }: ZoomStackProps) {
  const { canToggle, label, toggleStyleName } = useMapStyle();

  return (
    <fieldset className="zoom-stack">
      <legend className="sr-only">Map controls</legend>
      <button type="button" onClick={onZoomIn}>
        +
      </button>
      <button type="button" onClick={onZoomOut}>
        −
      </button>
      <button type="button" onClick={onFit}>
        Fit
      </button>
      {canToggle ? (
        <button className="zoom-stack-style" type="button" onClick={toggleStyleName}>
          {label}
        </button>
      ) : null}
    </fieldset>
  );
}
