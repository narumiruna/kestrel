'use client';

import Link from 'next/link';
import { type FormEvent, type ReactNode, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { formatError } from '@/components/dashboard/utils';

type DashboardSection = 'places' | 'routes';

type Props = {
  activeSection: DashboardSection;
  children: ReactNode;
  lastUpdatedAt?: Date | null;
  onLogout: () => void;
  onRefresh: () => void;
  username: string;
};

const sections: Array<{ href: string; icon: string; key: DashboardSection; label: string }> = [
  { href: '/dashboard/places', icon: '⌖', key: 'places', label: 'Places' },
  { href: '/dashboard/routes', icon: '⇄', key: 'routes', label: 'Routes' },
];

export default function DashboardShell({
  activeSection,
  children,
  lastUpdatedAt,
  onLogout,
  onRefresh,
  username,
}: Props) {
  const [isAccountOpen, setIsAccountOpen] = useState(false);

  return (
    <main className="shell kc-shell">
      <header className="kc-topbar">
        <div className="kc-brand">
          <span aria-hidden className="kc-logo">
            <KestrelIcon />
          </span>
          <div>
            <strong>Kestrel Cloud</strong>
            <span className="kc-signed-in">Routes and places workspace</span>
          </div>
        </div>
        <div className="kc-topbar-actions">
          <button
            aria-label={formatLastUpdated(lastUpdatedAt)}
            className="secondary kc-icon-button"
            title={formatLastUpdated(lastUpdatedAt)}
            type="button"
            onClick={onRefresh}
          >
            ↻
          </button>
          <div className="kc-user-menu">
            <button
              aria-expanded={isAccountOpen}
              className="secondary kc-user-button"
              type="button"
              onClick={() => setIsAccountOpen((current) => !current)}
            >
              <span aria-hidden className="kc-avatar">
                {username.slice(0, 1).toUpperCase()}
              </span>
              <span>{username}</span>
              <span aria-hidden>⌄</span>
            </button>
            {isAccountOpen ? <AccountMenu onLogout={onLogout} /> : null}
          </div>
        </div>
      </header>

      <nav aria-label="Dashboard sections" className="kc-tabs">
        {sections.map((section) => (
          <Link
            className={`kc-tab ${activeSection === section.key ? 'active' : ''}`}
            href={section.href}
            key={section.key}
          >
            <span aria-hidden>{section.icon}</span>
            {section.label}
          </Link>
        ))}
      </nav>

      {children}
    </main>
  );
}

function AccountMenu({ onLogout }: { onLogout: () => void }) {
  const auth = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function submitPasswordChange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(null);
    setError(null);
    setIsSaving(true);

    try {
      await auth.apiRequest('/auth/password/change', {
        body: JSON.stringify({ currentPassword, newPassword }),
        method: 'POST',
      });
      setCurrentPassword('');
      setNewPassword('');
      setNotice('Password updated.');
    } catch (nextError) {
      setError(formatError(nextError));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="kc-account-popover">
      <div className="stack">
        <div>
          <strong>Account</strong>
          <p className="muted no-margin">Change your password or sign out.</p>
        </div>
        {error == null ? null : <div className="error">{error}</div>}
        {notice == null ? null : <div className="success">{notice}</div>}
        <form className="stack" onSubmit={submitPasswordChange}>
          <label>
            Current password
            <input
              autoComplete="current-password"
              minLength={12}
              required
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
            />
          </label>
          <label>
            New password
            <input
              autoComplete="new-password"
              minLength={12}
              required
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
            />
          </label>
          <button disabled={isSaving} type="submit">
            {isSaving ? 'Saving…' : 'Change password'}
          </button>
        </form>
        <button className="secondary" type="button" onClick={onLogout}>
          Logout
        </button>
      </div>
    </div>
  );
}

function KestrelIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="24" viewBox="0 0 24 24" width="24">
      <path d="M3 13.2C8.4 4.7 15.7 3.1 21 4.1c-4.1 1.5-5.6 4.6-6.9 8.1" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
      <path d="M4.4 13.4c4.8-.5 8.2.5 10.8 3.2-4 .8-7.8-.1-10.8-3.2Z" fill="currentColor" opacity="0.25" />
      <path d="M13.9 12.1 21 20" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
    </svg>
  );
}

function formatLastUpdated(lastUpdatedAt?: Date | null): string {
  if (lastUpdatedAt == null) {
    return 'Refresh · not updated yet';
  }

  return `Refresh · last updated ${lastUpdatedAt.toLocaleTimeString()}`;
}
