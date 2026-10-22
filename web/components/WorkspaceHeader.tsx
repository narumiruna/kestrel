'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { type MouseEvent, type RefObject, useRef, useState } from 'react';
import { isCurrentTabNavigation } from '@/app/dashboard/map/navigationGuard';
import { BrandMark } from '@/components/BrandMark';
import {
  ChevronDownIcon,
  ChevronRightIcon,
  ExitIcon,
  GearIcon,
  ReloadIcon,
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
  const t = useTranslations('WorkspaceHeader');
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const settingsLinkRef = useRef<HTMLAnchorElement>(null);
  const refreshLabel =
    statusLabel == null ? t('refreshWorkspace') : t('refreshStatus', { status: statusLabel });

  return (
    <header className="kc-topbar workspace-topbar">
      <div className="workspace-header-start">
        <BrandMark subtitle={t('routesAndPlacesWorkspace')} />
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
            title={t('accountControls')}
            trigger={
              <Button
                aria-label={t('openAccountMenu', { username })}
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
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              settingsLinkRef.current?.focus();
            }}
          >
            <AccountMenu
              username={username}
              settingsLinkRef={settingsLinkRef}
              onSettingsClick={(event) => {
                setIsAccountOpen(false);
                if (!isCurrentTabNavigation(event)) return;
                if (onBeforeWorkspaceChange?.('/dashboard/account') === false) {
                  event.preventDefault();
                  return;
                }
                if (activeSection === 'account') {
                  event.preventDefault();
                  window.location.hash = 'preferences';
                }
              }}
              onLogout={onLogout}
            />
          </PopoverFrame>
        </div>
      </div>
    </header>
  );
}

function AccountMenu({
  onLogout,
  onSettingsClick,
  settingsLinkRef,
  username,
}: {
  onLogout: () => void | Promise<void>;
  onSettingsClick: (event: MouseEvent<HTMLAnchorElement>) => void;
  settingsLinkRef: RefObject<HTMLAnchorElement | null>;
  username: string;
}) {
  const t = useTranslations('WorkspaceHeader');

  return (
    <div className="account-menu">
      <div className="account-menu-heading">
        <strong>{t('account')}</strong>
        <span className="muted">{username}</span>
      </div>
      <div className="account-menu-options">
        <Link
          ref={settingsLinkRef}
          className="account-menu-row account-menu-link"
          href="/dashboard/account"
          onClick={onSettingsClick}
        >
          <GearIcon />
          <span className="account-menu-row-label">{t('accountSettings')}</span>
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
          <span className="account-menu-row-label">{t('logout')}</span>
        </Button>
      </div>
    </div>
  );
}
