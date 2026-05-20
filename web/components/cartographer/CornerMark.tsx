type CornerMarkProps = {
  label?: string;
};

export function CornerMark({ label = 'Kestrel survey sheet' }: CornerMarkProps) {
  return (
    <div aria-hidden className="corner-mark">
      <span>{label}</span>
    </div>
  );
}
