'use client';

import Link from 'next/link';
import { type FormEvent, type ReactNode, useEffect, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { formatError } from '@/components/dashboard/utils';
import { useTheme } from '@/components/ThemeProvider';
import { Button, PopoverFrame, TextInput } from '@/components/ui/radix-ui';

type DashboardSection = 'library' | 'map';

type Props = {
  activeSection: DashboardSection;
  children: ReactNode;
  isRefreshing?: boolean;
  lastUpdatedAt?: Date | null;
  onLogout: () => void;
  onRefresh: () => void;
  username: string;
};

const sections: Array<{ href: string; icon: ReactNode; key: DashboardSection; label: string }> = [
  { href: '/dashboard/map', icon: <MapPinIcon />, key: 'map', label: 'Map' },
  { href: '/dashboard/library', icon: <RouteIcon />, key: 'library', label: 'Library' },
];

export default function DashboardShell({
  activeSection,
  children,
  isRefreshing = false,
  lastUpdatedAt = null,
  onLogout,
  onRefresh,
  username,
}: Props) {
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const [isRefreshAnimating, setIsRefreshAnimating] = useState(false);
  const lastUpdatedLabel = useRelativeUpdatedLabel(lastUpdatedAt);
  const refreshLabel = formatRefreshLabel(lastUpdatedLabel);

  function handleRefresh() {
    setIsRefreshAnimating(false);
    window.requestAnimationFrame(() => setIsRefreshAnimating(true));
    window.setTimeout(() => setIsRefreshAnimating(false), 240);
    onRefresh();
  }

  return (
    <main className={`shell kc-shell kc-shell-${activeSection}`}>
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
          {lastUpdatedLabel == null ? null : (
            <span className="dashboard-last-updated">Updated {lastUpdatedLabel}</span>
          )}
          <Button
            aria-busy={isRefreshing}
            aria-label={refreshLabel}
            className={`secondary kc-icon-button ${isRefreshAnimating ? 'is-rotating' : ''}`}
            disabled={isRefreshing}
            title={refreshLabel}
            type="button"
            onClick={handleRefresh}
          >
            <RefreshCwIcon />
          </Button>
          <div className="kc-user-menu">
            <PopoverFrame
              className="kc-account-popover"
              open={isAccountOpen}
              title="Account controls"
              trigger={
                <Button className="secondary kc-user-button" type="button">
                  <span aria-hidden className="kc-avatar">
                    {username.slice(0, 1).toUpperCase()}
                  </span>
                  <span>{username}</span>
                  <ChevronDownIcon />
                </Button>
              }
              onOpenChange={setIsAccountOpen}
            >
              <AccountMenu onLogout={onLogout} />
            </PopoverFrame>
          </div>
        </div>
      </header>

      <nav aria-label="Dashboard sections" className="kc-tabs">
        {sections.map((section) => (
          <Link
            aria-current={activeSection === section.key ? 'page' : undefined}
            className={`kc-tab ${activeSection === section.key ? 'active' : ''}`}
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

function AccountMenu({ onLogout }: { onLogout: () => void }) {
  const auth = useAuth();
  const { isHydrated, theme, toggleTheme } = useTheme();
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
    <div className="stack">
      <div>
        <strong>Account</strong>
        <p className="muted no-margin">Change your password or sign out.</p>
      </div>
      {error == null ? null : (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      {notice == null ? null : (
        <div className="success" role="status">
          {notice}
        </div>
      )}
      <Button
        className="secondary kc-theme-toggle"
        disabled={!isHydrated}
        type="button"
        onClick={toggleTheme}
      >
        {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
        {theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      </Button>
      <form className="stack" onSubmit={submitPasswordChange}>
        <label htmlFor="radix-field-components-dashboard-dashboardshell-tsx-1">
          Current password
          <TextInput
            id="radix-field-components-dashboard-dashboardshell-tsx-1"
            autoComplete="current-password"
            required
            type="password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
          />
        </label>
        <label htmlFor="radix-field-components-dashboard-dashboardshell-tsx-2">
          New password
          <TextInput
            id="radix-field-components-dashboard-dashboardshell-tsx-2"
            autoComplete="new-password"
            minLength={12}
            required
            type="password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
          />
        </label>
        <Button disabled={isSaving} type="submit">
          {isSaving ? 'Saving…' : 'Change password'}
        </Button>
      </form>
      <Button className="secondary" type="button" onClick={onLogout}>
        Logout
      </Button>
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

function MapPinIcon() {
  return (
    <svg aria-hidden="true" className="lucide-icon" fill="none" viewBox="0 0 24 24">
      <path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function RouteIcon() {
  return (
    <svg aria-hidden="true" className="lucide-icon" fill="none" viewBox="0 0 24 24">
      <circle cx="6" cy="19" r="3" />
      <path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15" />
      <circle cx="18" cy="5" r="3" />
    </svg>
  );
}

function RefreshCwIcon() {
  return (
    <svg aria-hidden="true" className="lucide-icon" fill="none" viewBox="0 0 24 24">
      <path d="M3 12a9 9 0 0 1 15.5-6.2L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-15.5 6.2L3 16" />
      <path d="M3 21v-5h5" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg aria-hidden="true" className="lucide-icon" fill="none" viewBox="0 0 24 24">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg aria-hidden="true" className="lucide-icon" fill="none" viewBox="0 0 24 24">
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg aria-hidden="true" className="lucide-icon" fill="none" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="m4.93 4.93 1.41 1.41" />
      <path d="m17.66 17.66 1.41 1.41" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
      <path d="m6.34 17.66-1.41 1.41" />
      <path d="m19.07 4.93-1.41 1.41" />
    </svg>
  );
}

function useRelativeUpdatedLabel(lastUpdatedAt: Date | null): string | null {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (lastUpdatedAt == null) {
      return;
    }

    setNow(Date.now());
    const intervalId = window.setInterval(() => setNow(Date.now()), 30_000);

    return () => window.clearInterval(intervalId);
  }, [lastUpdatedAt]);

  if (lastUpdatedAt == null) {
    return null;
  }

  return formatRelativeTime(lastUpdatedAt, now);
}

function formatRelativeTime(date: Date, now: number): string {
  const elapsedSeconds = Math.max(0, Math.floor((now - date.getTime()) / 1000));

  if (elapsedSeconds < 10) {
    return 'Just now';
  }

  if (elapsedSeconds < 60) {
    return `${elapsedSeconds}s ago`;
  }

  const elapsedMinutes = Math.floor(elapsedSeconds / 60);

  if (elapsedMinutes < 60) {
    return `${elapsedMinutes}m ago`;
  }

  const elapsedHours = Math.floor(elapsedMinutes / 60);

  if (elapsedHours < 24) {
    return `${elapsedHours}h ago`;
  }

  return new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short' }).format(date);
}

function formatRefreshLabel(lastUpdatedLabel?: string | null): string {
  if (lastUpdatedLabel == null) {
    return 'Refresh · not updated yet';
  }

  return `Refresh · last updated ${lastUpdatedLabel}`;
}
