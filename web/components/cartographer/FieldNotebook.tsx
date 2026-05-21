import Link from 'next/link';
import type { ReactNode, RefObject } from 'react';

type FieldNotebookProps = {
  activeSection: 'places' | 'routes';
  children: ReactNode;
  count: number;
  newLabel: string;
  onNewEntry: () => void;
  onSearchChange: (value: string) => void;
  searchPlaceholder: string;
  searchRef?: RefObject<HTMLInputElement | null>;
  searchValue: string;
};

export function FieldNotebook({
  activeSection,
  children,
  count,
  newLabel,
  onNewEntry,
  onSearchChange,
  searchPlaceholder,
  searchRef,
  searchValue,
}: FieldNotebookProps) {
  const activeCount = <span className="notebook-tab-count font-mono">{count}</span>;

  return (
    <aside className="field-notebook" aria-label={`${activeSection} field notebook`}>
      <div aria-hidden className="field-notebook-spine" />
      <nav aria-label="Cartographer sections" className="notebook-nav">
        <Link
          aria-current={activeSection === 'places' ? 'page' : undefined}
          className={activeSection === 'places' ? 'active' : ''}
          href="/dashboard/places"
        >
          <span>Places</span>
          {activeSection === 'places' ? activeCount : null}
        </Link>
        <Link
          aria-current={activeSection === 'routes' ? 'page' : undefined}
          className={activeSection === 'routes' ? 'active' : ''}
          href="/dashboard/routes"
        >
          <span>Routes</span>
          {activeSection === 'routes' ? activeCount : null}
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
        <span aria-hidden className="notebook-new-entry-icon">
          +
        </span>
        <span>
          <strong>{newLabel}</strong>
          <small>
            {activeSection === 'routes'
              ? 'Create from map pins or favorites'
              : 'Save a place with coordinates'}
          </small>
        </span>
      </button>
      <div className="notebook-list">{children}</div>
    </aside>
  );
}
