'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';

type DashboardSection = 'places' | 'routes';

type Props = {
  activeSection: DashboardSection;
  children: ReactNode;
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
          <button className="secondary" type="button" onClick={onRefresh}>
            Refresh
          </button>
          <button className="secondary" type="button" onClick={onLogout}>
            Logout
          </button>
        </div>
      </header>

      <nav aria-label="Dashboard sections" className="kc-tabs">
        {sections.map((section) => (
          <Link
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
