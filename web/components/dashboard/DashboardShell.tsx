'use client';

import { type ReactNode, useEffect, useState } from 'react';
import { WorkspaceHeader } from '@/components/WorkspaceHeader';
import type { WorkspaceSection } from '@/components/WorkspaceTabs';

type Props = {
  activeSection: WorkspaceSection;
  children: ReactNode;
  isRefreshing?: boolean;
  lastUpdatedAt?: Date | null;
  onLogout: () => void;
  onRefresh: () => void;
  statusError?: string | null;
  username: string;
};

export default function DashboardShell({
  activeSection,
  children,
  isRefreshing = false,
  lastUpdatedAt = null,
  onLogout,
  onRefresh,
  statusError = null,
  username,
}: Props) {
  const lastUpdatedLabel = useRelativeUpdatedLabel(lastUpdatedAt);

  return (
    <main className={`shell kc-shell kc-shell-${activeSection}`}>
      <WorkspaceHeader
        activeSection={activeSection}
        isRefreshing={isRefreshing}
        statusError={statusError}
        statusLabel={lastUpdatedLabel == null ? null : `Updated ${lastUpdatedLabel}`}
        username={username}
        onLogout={onLogout}
        onRefresh={onRefresh}
      />
      {children}
    </main>
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
    return 'just now';
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
