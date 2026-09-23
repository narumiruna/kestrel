'use client';

import Link from 'next/link';
import { useState } from 'react';
import { BrandMark } from '@/components/BrandMark';
import { useTheme } from '@/components/ThemeProvider';
import {
  ChevronDownIcon,
  ChevronRightIcon,
  ExitIcon,
  LockClosedIcon,
  MoonIcon,
  ReloadIcon,
  SunIcon,
} from '@/components/ui/icons';
import { Button, PopoverFrame } from '@/components/ui/radix-ui';
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
              <Button
                aria-label={`Open account menu for ${username}`}
                className="secondary kc-user-button"
                type="button"
              >
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
  const { isHydrated, theme, toggleTheme } = useTheme();

  return (
    <div className="account-menu">
      <div className="account-menu-heading">
        <strong>Account</strong>
        <span className="muted">{username}</span>
      </div>
      <div className="account-menu-options">
        <Button
          aria-label={`Dark mode, ${theme === 'dark' ? 'on' : 'off'}`}
          aria-pressed={theme === 'dark'}
          className="secondary account-menu-row"
          disabled={!isHydrated}
          type="button"
          onClick={toggleTheme}
        >
          {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
          <span className="account-menu-row-label">
            Appearance <span className="account-menu-detail">Dark mode</span>
          </span>
          <span className="account-menu-value">{theme === 'dark' ? 'On' : 'Off'}</span>
        </Button>
        <Link className="account-menu-row account-menu-link" href="/dashboard/account">
          <LockClosedIcon />
          <span className="account-menu-row-label">Account security</span>
          <ChevronRightIcon className="account-menu-chevron" />
        </Link>
      </div>
      <div className="account-menu-footer">
        <Button
          className="secondary account-menu-row account-menu-logout"
          type="button"
          onClick={onLogout}
        >
          <ExitIcon />
          <span className="account-menu-row-label">Logout</span>
        </Button>
      </div>
    </div>
  );
}
