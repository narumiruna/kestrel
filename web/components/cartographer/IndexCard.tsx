import type { ReactNode } from 'react';

type IndexCardProps = {
  actions?: ReactNode;
  children: ReactNode;
  eyebrow?: ReactNode;
  meta?: ReactNode;
  stamp?: string;
  subtitle?: string;
  title: string;
  variant?: 'place' | 'route';
};

export function IndexCard({
  actions,
  children,
  eyebrow,
  meta,
  stamp,
  subtitle,
  title,
  variant = 'place',
}: IndexCardProps) {
  return (
    <section className={`index-card index-card-${variant}`} aria-label={`${title} index card`}>
      <span aria-hidden className="index-card-pin" />
      {eyebrow == null ? null : <div className="index-card-breadcrumb breadcrumb">{eyebrow}</div>}
      <header className="index-card-header">
        <div>
          {stamp == null ? null : <p className="index-card-stamp font-mono">{stamp}</p>}
          <h2 className="font-serif">{title}</h2>
          {subtitle == null ? null : <p>{subtitle}</p>}
        </div>
        {actions == null ? null : <div className="index-card-actions">{actions}</div>}
      </header>
      {meta == null ? null : <div className="index-card-meta">{meta}</div>}
      <div className="index-card-body">{children}</div>
    </section>
  );
}
