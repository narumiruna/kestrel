type BrandMarkProps = {
  className?: string;
  subtitle: string;
};

export function BrandMark({ className = '', subtitle }: BrandMarkProps) {
  return (
    <div className={`kc-brand ${className}`.trim()}>
      <span aria-hidden className="kc-logo">
        <KestrelIcon />
      </span>
      <div>
        <strong>Kestrel Cloud</strong>
        <span className="kc-signed-in">{subtitle}</span>
      </div>
    </div>
  );
}

function KestrelIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="36" viewBox="0 0 28 28" width="36">
      <path
        d="M4 16.5C9.8 8.2 17.3 5.4 24 6.3c-4.8 1.7-8 5.2-9.9 10.8"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
      <path d="M5.4 16.7c5.2-.4 9.1.9 12 4.1-4.7.8-8.6-.2-12-4.1Z" fill="currentColor" />
    </svg>
  );
}
