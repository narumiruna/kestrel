import Link from 'next/link';
import type { ReactNode, RefObject } from 'react';

type FieldNotebookProps = {
  activeSection: 'places' | 'routes';
  children: ReactNode;
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
  newLabel,
  onNewEntry,
  onSearchChange,
  searchPlaceholder,
  searchRef,
  searchValue,
}: FieldNotebookProps) {
  return (
    <aside className="field-notebook" aria-label={`${activeSection} field notebook`}>
      <div aria-hidden className="field-notebook-spine" />
      <SidebarTabs activeSection={activeSection} />
      <SidebarSearch
        searchPlaceholder={searchPlaceholder}
        searchRef={searchRef}
        searchValue={searchValue}
        onSearchChange={onSearchChange}
      />
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

function SidebarTabs({ activeSection }: { activeSection: 'places' | 'routes' }) {
  return (
    <nav aria-label="Cartographer sections" className="sidebar-tabs">
      <Link
        aria-current={activeSection === 'places' ? 'page' : undefined}
        className={activeSection === 'places' ? 'active' : ''}
        href="/dashboard/library/places"
      >
        <span>Places</span>
      </Link>
      <Link
        aria-current={activeSection === 'routes' ? 'page' : undefined}
        className={activeSection === 'routes' ? 'active' : ''}
        href="/dashboard/library/routes"
      >
        <span>Routes</span>
      </Link>
    </nav>
  );
}

function SidebarSearch({
  onSearchChange,
  searchPlaceholder,
  searchRef,
  searchValue,
}: {
  onSearchChange: (value: string) => void;
  searchPlaceholder: string;
  searchRef?: RefObject<HTMLInputElement | null>;
  searchValue: string;
}) {
  return (
    <label className="sidebar-search font-mono">
      <span className="sr-only">Search</span>
      <input
        ref={searchRef}
        placeholder={searchPlaceholder}
        value={searchValue}
        onChange={(event) => onSearchChange(event.target.value)}
      />
    </label>
  );
}
