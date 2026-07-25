'use client';

import { type FormEvent, type ReactNode, useEffect, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { BrandMark } from '@/components/BrandMark';
import { formatError } from '@/components/dashboard/utils';
import { useTheme } from '@/components/ThemeProvider';
import { Button, PopoverFrame, TextInput } from '@/components/ui/radix-ui';
import { type WorkspaceSection, WorkspaceTabs } from '@/components/WorkspaceTabs';

type Props = {
  activeSection: WorkspaceSection;
  children: ReactNode;
  isRefreshing?: boolean;
  lastUpdatedAt?: Date | null;
  onLogout: () => void;
  onRefresh: () => void;
  username: string;
};

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
        <div className="workspace-header-start">
          <BrandMark subtitle="Routes and places workspace" />
          <WorkspaceTabs activeSection={activeSection} />
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
              <AccountMenu username={username} onLogout={onLogout} />
            </PopoverFrame>
          </div>
        </div>
      </header>

      {children}
    </main>
  );
}

function AccountMenu({ onLogout, username }: { onLogout: () => void; username: string }) {
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
        <input
          aria-hidden="true"
          autoComplete="username"
          className="sr-only"
          readOnly
          tabIndex={-1}
          value={username}
        />
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
