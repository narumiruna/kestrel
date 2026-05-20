import Link from 'next/link';
import type { ReactNode, RefObject } from 'react';

type FieldNotebookProps = {
  activeSection: 'places' | 'routes';
  children: ReactNode;
  count: number;
  newLabel: string;
  onNewEntry: () => void;
  onSearchChange: (value: string) => void;
  pageLabel: string;
  searchPlaceholder: string;
  searchRef?: RefObject<HTMLInputElement | null>;
  searchValue: string;
  title: string;
};

export function FieldNotebook({
  activeSection,
  children,
  count,
  newLabel,
  onNewEntry,
  onSearchChange,
  pageLabel,
  searchPlaceholder,
  searchRef,
  searchValue,
  title,
}: FieldNotebookProps) {
  return (
    <aside className="field-notebook" aria-label={`${title} field notebook`}>
      <div aria-hidden className="field-notebook-spine" />
      <header className="field-notebook-header">
        <div>
          <p className="field-kicker font-mono">{pageLabel}</p>
          <h1 className="font-serif">{title}</h1>
        </div>
        <span className="notebook-count font-mono">{count}</span>
      </header>
      <nav aria-label="Cartographer sections" className="notebook-nav">
        <Link
          aria-current={activeSection === 'places' ? 'page' : undefined}
          className={activeSection === 'places' ? 'active' : ''}
          href="/dashboard/places"
        >
          Places
        </Link>
        <Link
          aria-current={activeSection === 'routes' ? 'page' : undefined}
          className={activeSection === 'routes' ? 'active' : ''}
          href="/dashboard/routes"
        >
          Routes
        </Link>
      </nav>
      <label className="notebook-search font-mono">
        Search
        <input
          ref={searchRef}
          placeholder={searchPlaceholder}
          value={searchValue}
          onChange={(event) => onSearchChange(event.target.value)}
        />
      </label>
      <button className="notebook-new-entry" type="button" onClick={onNewEntry}>
        + {newLabel}
      </button>
      <div className="notebook-list">{children}</div>
      <footer className="notebook-page font-mono">{pageLabel}</footer>
    </aside>
  );
}
