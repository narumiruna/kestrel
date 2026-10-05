import type { Place, Route } from '@/lib/api';

export type LibrarySort = 'name' | 'updated';
export type LibraryEntry = { kind: 'places'; item: Place } | { kind: 'routes'; item: Route };

const names = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

function updatedRank(entry: LibraryEntry): number {
  const timestamp = Date.parse(entry.item.updatedAt);
  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
}

export function sortLibraryEntries(entries: LibraryEntry[], sort: LibrarySort): LibraryEntry[] {
  return [...entries].sort((a, b) => {
    if (sort === 'updated') {
      const aRank = updatedRank(a);
      const bRank = updatedRank(b);
      if (aRank !== bRank) return aRank > bRank ? -1 : 1;
    }
    return (
      names.compare(a.item.name, b.item.name) ||
      a.kind.localeCompare(b.kind) ||
      a.item.id.localeCompare(b.item.id)
    );
  });
}
