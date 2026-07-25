'use client';

import Link from 'next/link';
import type { MouseEvent } from 'react';

export type WorkspaceSection = 'library' | 'map';

type WorkspaceTabsProps = {
  activeSection: WorkspaceSection;
  onBeforeChange?: (href: string) => boolean;
};

const sections: Array<{ href: string; key: WorkspaceSection; label: string }> = [
  { href: '/dashboard/map', key: 'map', label: 'Map' },
  { href: '/dashboard/library', key: 'library', label: 'Library' },
];

export function WorkspaceTabs({ activeSection, onBeforeChange }: WorkspaceTabsProps) {
  function handleChange(event: MouseEvent<HTMLAnchorElement>) {
    if (onBeforeChange?.(event.currentTarget.getAttribute('href') ?? '/') === false) {
      event.preventDefault();
    }
  }

  return (
    <nav aria-label="Workspace tabs" className="workspace-tabs">
      {sections.map((section) => (
        <Link
          aria-current={activeSection === section.key ? 'page' : undefined}
          className={activeSection === section.key ? 'active' : undefined}
          href={section.href}
          key={section.key}
          onClick={handleChange}
        >
          {section.label}
        </Link>
      ))}
    </nav>
  );
}
