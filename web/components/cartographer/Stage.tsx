import type { ReactNode } from 'react';

type StageProps = {
  children: ReactNode;
  map: ReactNode;
  mode: 'places' | 'routes';
};

export function Stage({ children, map, mode }: StageProps) {
  return (
    <main className={`cartographer-stage cartographer-stage-${mode}`}>
      <div className="cartographer-map-layer">{map}</div>
      <div aria-hidden className="cartographer-paper-vignette" />
      {children}
    </main>
  );
}
