type BrandMarkProps = {
  className?: string;
  subtitle: string;
  titleAs?: 'h1' | 'strong';
};

export function BrandMark({ className = '', subtitle, titleAs = 'strong' }: BrandMarkProps) {
  return (
    <div className={`kc-brand ${className}`.trim()}>
      <span aria-hidden className="kc-logo">
        <KestrelIcon />
      </span>
      <div>
        {titleAs === 'h1' ? (
          <h1 className="kc-brand-title">Kestrel Cloud</h1>
        ) : (
          <strong className="kc-brand-title">Kestrel Cloud</strong>
        )}
        <span className="kc-signed-in">{subtitle}</span>
      </div>
    </div>
  );
}

function KestrelIcon() {
  return (
    <svg aria-hidden="true" fill="currentColor" height="36" viewBox="14 24 80 62" width="36">
      <path d="M25.5 77.1C39.8 59.3 59.3 46.9 86.9 38.9 70.9 59.3 48.7 72.7 25.5 77.1Z" />
      <path d="M22 62C39.8 49.5 60.2 40.7 86 37.1 68.2 52.2 44.2 62.9 22 62Z" />
      <path d="M27.3 48.7C44.2 40.7 62 36.2 83.4 35.3 67.4 45.1 47.8 51.3 27.3 48.7Z" />
      <path d="M38 37.1C52.2 32.6 66.5 30.9 81.6 32.6 68.2 38.9 53.1 41.5 38 37.1Z" />
    </svg>
  );
}
