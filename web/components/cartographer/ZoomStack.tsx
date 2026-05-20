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
      <button aria-label="Zoom in" type="button" onClick={onZoomIn}>
        +
      </button>
      <button aria-label="Zoom out" type="button" onClick={onZoomOut}>
        −
      </button>
      <button className="zoom-stack-fit" type="button" onClick={onFit}>
        <FitIcon />
        Fit
      </button>
      {canToggle ? (
        <button className="zoom-stack-style" type="button" onClick={toggleStyleName}>
          <BookOpenIcon />
          <span>Map: {label}</span>
        </button>
      ) : null}
    </fieldset>
  );
}

function FitIcon() {
  return (
    <svg aria-hidden="true" className="lucide-icon" fill="none" viewBox="0 0 24 24">
      <path d="M8 3H5a2 2 0 0 0-2 2v3" />
      <path d="M16 3h3a2 2 0 0 1 2 2v3" />
      <path d="M8 21H5a2 2 0 0 1-2-2v-3" />
      <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
    </svg>
  );
}

function BookOpenIcon() {
  return (
    <svg aria-hidden="true" className="lucide-icon" fill="none" viewBox="0 0 24 24">
      <path d="M12 7v14" />
      <path d="M3 18a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3z" />
      <path d="M21 18a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1h-5a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3z" />
    </svg>
  );
}
