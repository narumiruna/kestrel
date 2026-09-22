export function ScaleBar({ hidden = false }: { hidden?: boolean }) {
  if (hidden) {
    return null;
  }

  return (
    <div aria-hidden className="scale-bar">
      <span />
      <span />
      <span />
      <strong className="font-mono">1 km</strong>
    </div>
  );
}
