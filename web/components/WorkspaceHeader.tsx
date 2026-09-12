'use client';

import { ChevronDownIcon, MoonIcon, ReloadIcon, SunIcon } from '@radix-ui/react-icons';
import Link from 'next/link';
import { type FormEvent, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { BrandMark } from '@/components/BrandMark';
import { formatError } from '@/components/dashboard/utils';
import { useTheme } from '@/components/ThemeProvider';
import { Button, PopoverFrame, TextInput } from '@/components/ui/radix-ui';
import { type WorkspaceSection, WorkspaceTabs } from '@/components/WorkspaceTabs';

type WorkspaceHeaderProps = {
  activeSection: WorkspaceSection;
  isRefreshing?: boolean;
  onBeforeWorkspaceChange?: (href: string) => boolean;
  onLogout: () => void | Promise<void>;
  onRefresh: () => void;
  statusError?: string | null;
  statusLabel?: string | null;
  username: string;
};

export function WorkspaceHeader({
  activeSection,
  isRefreshing = false,
  onBeforeWorkspaceChange,
  onLogout,
  onRefresh,
  statusError = null,
  statusLabel = null,
  username,
}: WorkspaceHeaderProps) {
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const refreshLabel = statusLabel == null ? 'Refresh workspace' : `Refresh · ${statusLabel}`;

  return (
    <header className="kc-topbar workspace-topbar">
      <div className="workspace-header-start">
        <BrandMark subtitle="Routes and places workspace" />
        <WorkspaceTabs activeSection={activeSection} onBeforeChange={onBeforeWorkspaceChange} />
      </div>
      <div className="kc-topbar-actions workspace-header-actions">
        {statusLabel == null && statusError == null ? null : (
          <span
            className={`workspace-sync-status${statusError == null ? '' : ' is-error'}`}
            role={statusError == null ? undefined : 'alert'}
            title={statusError ?? statusLabel ?? undefined}
          >
            <span aria-hidden className="workspace-sync-dot" />
            <span>{statusError ?? statusLabel}</span>
          </span>
        )}
        <Button
          aria-busy={isRefreshing}
          aria-label={refreshLabel}
          className="secondary kc-icon-button workspace-refresh-button"
          disabled={isRefreshing}
          title={refreshLabel}
          type="button"
          onClick={onRefresh}
        >
          <ReloadIcon aria-hidden />
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
                <span className="workspace-username">{username}</span>
                <ChevronDownIcon aria-hidden className="workspace-account-chevron" />
              </Button>
            }
            onOpenChange={setIsAccountOpen}
          >
            <AccountMenu username={username} onLogout={onLogout} />
          </PopoverFrame>
        </div>
      </div>
    </header>
  );
}

function AccountMenu({
  onLogout,
  username,
}: {
  onLogout: () => void | Promise<void>;
  username: string;
}) {
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
        <p className="muted no-margin">Theme, password, and session controls.</p>
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
      <Link className="secondary button-link" href="/dashboard/account">
        Account security
      </Link>
      <Button
        className="secondary kc-theme-toggle"
        disabled={!isHydrated}
        type="button"
        onClick={toggleTheme}
      >
        {theme === 'dark' ? <SunIcon aria-hidden /> : <MoonIcon aria-hidden />}
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
        <label htmlFor="workspace-current-password">
          Current password
          <TextInput
            id="workspace-current-password"
            autoComplete="current-password"
            required
            type="password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
          />
        </label>
        <label htmlFor="workspace-new-password">
          New password
          <TextInput
            id="workspace-new-password"
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
