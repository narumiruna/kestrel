import assert from 'node:assert/strict';
import test from 'node:test';
import { type LibraryEntry, sortLibraryEntries } from './librarySort.ts';

const entry = (kind: LibraryEntry['kind'], id: string, name: string, updatedAt = '2026-10-01') =>
  ({ kind, item: { id, name, updatedAt } }) as LibraryEntry;

test('name sorting interleaves places and routes with natural numeric order', () => {
  const entries = [
    entry('places', 'p', 'Route 10'),
    entry('routes', 'r', 'Route 2'),
    entry('routes', 'b', 'Berlin'),
  ];
  assert.deepEqual(
    sortLibraryEntries(entries, 'name').map((e) => e.item.id),
    ['b', 'r', 'p'],
  );
  assert.deepEqual(
    entries.map((e) => e.item.id),
    ['p', 'r', 'b'],
  );
});

test('recent sorting uses saved timestamps and stable name/identity tie breakers', () => {
  const entries = [
    entry('places', 'b', 'Same'),
    entry('routes', 'r', 'Same'),
    entry('places', 'a', 'Same'),
    entry('routes', 'new', 'Z', '2026-10-05'),
  ];
  assert.deepEqual(
    sortLibraryEntries(entries, 'updated').map((e) => e.item.id),
    ['new', 'a', 'b', 'r'],
  );
});

test('empty results and invalid dates remain deterministic', () => {
  assert.deepEqual(sortLibraryEntries([], 'name'), []);
  assert.deepEqual(
    sortLibraryEntries([entry('places', 'z', 'Z', ''), entry('routes', 'a', 'A')], 'updated').map(
      (e) => e.item.id,
    ),
    ['a', 'z'],
  );
});
