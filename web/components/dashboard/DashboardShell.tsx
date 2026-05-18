'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';

type DashboardSection = 'places' | 'routes';

type Props = {
  activeSection: DashboardSection;
  children: ReactNode;
  isRefreshing?: boolean;
  lastUpdatedLabel?: string | null;
  onLogout: () => void;
  onRefresh: () => void;
  username: string;
};

const sections: Array<{ href: string; key: DashboardSection; label: string }> = [
  { href: '/dashboard/places', key: 'places', label: 'Places' },
  { href: '/dashboard/routes', key: 'routes', label: 'Routes' },
];

export default function DashboardShell({
  activeSection,
  children,
  isRefreshing = false,
  lastUpdatedLabel = null,
  onLogout,
  onRefresh,
  username,
}: Props) {
  return (
    <main className="shell kc-shell">
      <header className="kc-topbar">
        <div className="kc-brand">
          <strong>Kestrel Cloud</strong>
          <span className="kc-signed-in">Signed in as {username}</span>
        </div>
        <div className="kc-topbar-actions">
          <button
            aria-busy={isRefreshing}
            className="secondary"
            disabled={isRefreshing}
            type="button"
            onClick={onRefresh}
          >
            {isRefreshing ? 'Refreshing…' : 'Refresh'}
          </button>
          <button className="secondary" type="button" onClick={onLogout}>
            Logout
          </button>
        </div>
      </header>
      {lastUpdatedLabel == null ? null : (
        <p className="muted dashboard-last-updated">Updated {lastUpdatedLabel}</p>
      )}

      <nav aria-label="Dashboard sections" className="kc-tabs">
        {sections.map((section) => (
          <Link
            aria-current={activeSection === section.key ? 'page' : undefined}
            className={`kc-tab ${activeSection === section.key ? 'active' : ''}`}
            href={section.href}
            key={section.key}
          >
            {section.label}
          </Link>
        ))}
      </nav>

      {children}
    </main>
  );
}
