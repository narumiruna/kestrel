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

test('malformed timestamps sort after every valid date independently of input order', () => {
  const entries = [
    entry('places', 'old', 'A', '1960-01-01'),
    entry('routes', 'invalid', 'B', 'not-a-date'),
    entry('places', 'new', 'C', '2026-01-01'),
  ];
  for (const permutation of [
    [0, 1, 2],
    [0, 2, 1],
    [1, 0, 2],
    [1, 2, 0],
    [2, 0, 1],
    [2, 1, 0],
  ]) {
    const input = permutation.map((index) => entries[index]);
    const before = [...input];
    assert.deepEqual(
      sortLibraryEntries(input, 'updated').map((e) => e.item.id),
      ['new', 'old', 'invalid'],
    );
    assert.deepEqual(input, before);
  }
});

test('invalid timestamps share a rank and retain name/kind/identity tie breakers', () => {
  const entries = [
    entry('routes', 'r', 'Same', 'bad'),
    entry('places', 'b', 'Same', ''),
    entry('places', 'a', 'Same', 'bad'),
    entry('routes', 'first', 'A', ''),
  ];
  assert.deepEqual(
    sortLibraryEntries(entries, 'updated').map((e) => e.item.id),
    ['first', 'a', 'b', 'r'],
  );
  assert.deepEqual(
    sortLibraryEntries([...entries].reverse(), 'updated').map((e) => e.item.id),
    ['first', 'a', 'b', 'r'],
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
