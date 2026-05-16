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

const sections: Array<{
  href: string;
  icon: ReactNode;
  key: DashboardSection;
  label: string;
}> = [
  {
    href: '/dashboard/places',
    icon: (
      <svg
        aria-hidden="true"
        fill="none"
        height="15"
        stroke="currentColor"
        strokeWidth="2"
        viewBox="0 0 24 24"
        width="15"
      >
        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
        <circle cx="12" cy="10" r="3" />
      </svg>
    ),
    key: 'places',
    label: 'Places',
  },
  {
    href: '/dashboard/routes',
    icon: (
      <svg
        aria-hidden="true"
        fill="none"
        height="15"
        stroke="currentColor"
        strokeWidth="2"
        viewBox="0 0 24 24"
        width="15"
      >
        <circle cx="5" cy="6" r="2" />
        <path d="M7 6h5a2 2 0 0 1 2 2v2a2 2 0 0 0 2 2h1" />
        <circle cx="19" cy="14" r="2" />
        <path d="M5 8v10" />
        <circle cx="5" cy="20" r="2" />
      </svg>
    ),
    key: 'routes',
    label: 'Routes',
  },
];

export default function DashboardShell({
  activeSection,
  children,
  onLogout,
  onRefresh,
  username,
}: Props) {
  return (
    <main className="shell">
      <header className="topbar dashboard-topbar">
        <div className="brand">
          <svg
            aria-hidden="true"
            fill="currentColor"
            height="26"
            style={{ color: 'var(--color-topbar-text)' }}
            viewBox="0 0 24 24"
            width="26"
          >
            {/* Kestrel bird silhouette */}
            <path d="M22 7c-2.2 1-4.5 1.4-6.5.8L12 11 8.5 7.8C6.5 8.4 4.2 8 2 7c1.4 2 3.4 3.3 5 4l1.5-1L12 14l3.5-4 1.5 1c1.6-.7 3.6-2 5-4z" />
          </svg>
          <div className="brand-wordmark">
            <strong>Kestrel Cloud</strong>
          </div>
          <div className="topbar-user">
            <span className="user-avatar" title={`Signed in as ${username}`}>
              <svg
                aria-hidden="true"
                fill="none"
                height="16"
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 24 24"
                width="16"
              >
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </span>
            <span className="muted" style={{ fontSize: '0.875rem' }}>
              Signed in as {username}
            </span>
            <span aria-hidden="true" className="user-dot" title="Online" />
          </div>
        </div>
        <div className="row dashboard-actions">
          <button className="secondary" type="button" onClick={onRefresh}>
            <svg
              aria-hidden="true"
              fill="none"
              height="14"
              stroke="currentColor"
              strokeWidth="2"
              viewBox="0 0 24 24"
              width="14"
            >
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
            </svg>
            Refresh
          </button>
          <button className="secondary" type="button" onClick={onLogout}>
            <svg
              aria-hidden="true"
              fill="none"
              height="14"
              stroke="currentColor"
              strokeWidth="2"
              viewBox="0 0 24 24"
              width="14"
            >
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16,17 21,12 16,7" />
              <line x1="21" x2="9" y1="12" y2="12" />
            </svg>
            Logout
          </button>
        </div>
      </header>

      <nav aria-label="Dashboard sections" className="dashboard-tabs">
        {sections.map((section) => (
          <Link
            className={`dashboard-tab ${activeSection === section.key ? 'active' : ''}`}
            href={section.href}
            key={section.key}
          >
            {section.icon}
            {section.label}
          </Link>
        ))}
      </nav>

      {children}
    </main>
  );
}
