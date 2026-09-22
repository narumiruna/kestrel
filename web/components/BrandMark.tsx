import Image from 'next/image';

type BrandMarkProps = {
  className?: string;
  subtitle: string;
  titleAs?: 'h1' | 'strong';
};

export function BrandMark({ className = '', subtitle, titleAs = 'strong' }: BrandMarkProps) {
  return (
    <div className={`kc-brand ${className}`.trim()}>
      <span aria-hidden className="kc-logo">
        <Image alt="" className="kc-logo-image" height={108} src="/icon.svg" width={108} />
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
