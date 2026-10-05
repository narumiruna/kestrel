import type { Place, Route } from '@/lib/api';

export type LibrarySort = 'name' | 'updated';
export type LibraryEntry = { kind: 'places'; item: Place } | { kind: 'routes'; item: Route };

const names = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

export function sortLibraryEntries(entries: LibraryEntry[], sort: LibrarySort): LibraryEntry[] {
  return [...entries].sort((a, b) => {
    if (sort === 'updated') {
      const difference = Date.parse(b.item.updatedAt) - Date.parse(a.item.updatedAt);
      if (Number.isFinite(difference) && difference !== 0) return difference;
    }
    return (
      names.compare(a.item.name, b.item.name) ||
      a.kind.localeCompare(b.kind) ||
      a.item.id.localeCompare(b.item.id)
    );
  });
}
