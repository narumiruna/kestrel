'use client';

import { useLocale, useTranslations } from 'next-intl';
import { type ReactNode, useEffect, useState } from 'react';
import { WorkspaceHeader } from '@/components/WorkspaceHeader';
import type { WorkspaceSection } from '@/components/WorkspaceTabs';
import { formatRelativeUpdated } from '@/i18n/format';

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
  const t = useTranslations('DashboardShell');
  const lastUpdatedLabel = useRelativeUpdatedLabel(lastUpdatedAt);

  return (
    <main className={`shell kc-shell kc-shell-${activeSection}`}>
      <WorkspaceHeader
        activeSection={activeSection}
        isRefreshing={isRefreshing}
        statusLabel={lastUpdatedLabel == null ? null : t('updated', { time: lastUpdatedLabel })}
        username={username}
        onLogout={onLogout}
        onRefresh={onRefresh}
      />
      {children}
    </main>
  );
}

function useRelativeUpdatedLabel(lastUpdatedAt: Date | null): string | null {
  const locale = useLocale();
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

  return formatRelativeUpdated(lastUpdatedAt, now, locale);
}
