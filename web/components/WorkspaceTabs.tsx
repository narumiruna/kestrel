'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { MouseEvent } from 'react';

export type WorkspaceSection = 'library' | 'map' | 'account';

type WorkspaceTabsProps = {
  activeSection: WorkspaceSection;
  onBeforeChange?: (href: string) => boolean;
};

const sections: Array<{ href: string; key: WorkspaceSection; label: 'map' | 'library' }> = [
  { href: '/dashboard/map', key: 'map', label: 'map' },
  { href: '/dashboard/library', key: 'library', label: 'library' },
];

export function WorkspaceTabs({ activeSection, onBeforeChange }: WorkspaceTabsProps) {
  const t = useTranslations('WorkspaceTabs');
  function handleChange(event: MouseEvent<HTMLAnchorElement>) {
    if (onBeforeChange?.(event.currentTarget.getAttribute('href') ?? '/') === false) {
      event.preventDefault();
    }
  }

  return (
    <nav aria-label={t('workspaceTabs')} className="workspace-tabs">
      {sections.map((section) => (
        <Link
          aria-current={activeSection === section.key ? 'page' : undefined}
          className={activeSection === section.key ? 'active' : undefined}
          href={section.href}
          key={section.key}
          onClick={handleChange}
        >
          {t(section.label)}
        </Link>
      ))}
    </nav>
  );
}
