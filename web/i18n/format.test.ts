import assert from 'node:assert/strict';
import test from 'node:test';
import { matchesPlaceSearch } from '../components/dashboard/librarySearch.ts';
import { type LibraryEntry, sortLibraryEntries } from '../components/dashboard/librarySort.ts';
import { formatDistance, formatNumber, formatRelativeUpdated, formatSpeed } from './format.ts';
import { mapLibreLocale, updateMapLabels } from './map.ts';

test('decimal-comma display does not change machine coordinate or JSON values', () => {
  const coordinate = 25.033123;
  assert.equal(formatNumber(coordinate, 'de', { maximumFractionDigits: 6 }), '25,033123');
  assert.match(formatDistance(1.5, 'de'), /1,5/);
  assert.match(formatSpeed(4.5, 'pl'), /4,5/);
  assert.equal(coordinate.toFixed(6), '25.033123');
  assert.equal(JSON.stringify({ latitude: coordinate }), '{"latitude":25.033123}');
});
test('relative display uses locale and preserves runtime time zone behavior', () => {
  const date = new Date('2026-01-01T12:00:00Z');
  assert.notEqual(
    formatRelativeUpdated(date, date.getTime() + 60000, 'en'),
    formatRelativeUpdated(date, date.getTime() + 60000, 'ja'),
  );
  assert.equal(
    formatRelativeUpdated(date, date.getTime(), 'de'),
    new Intl.RelativeTimeFormat('de', { numeric: 'auto', style: 'short' }).format(0, 'second'),
  );
});
test('Turkish search and name collation are locale aware with stable ID tie-breaks', () => {
  const place = { name: 'IĞDIR', description: null, tags: [] };
  assert.equal(matchesPlaceSearch(place as never, 'ığdır', 'tr'), true);
  assert.equal(matchesPlaceSearch(place as never, 'ığdır', 'en'), false);
  const entries = ['z', 'ä', 'a'].map((name, index) => ({
    kind: 'places',
    item: { id: String(index), name, updatedAt: '2026-01-01' },
  })) as LibraryEntry[];
  const names = new Intl.Collator('de', { numeric: true, sensitivity: 'base' });
  assert.deepEqual(
    sortLibraryEntries(entries, 'name', 'de').map((x) => x.item.name),
    [...entries]
      .sort((a, b) => names.compare(a.item.name, b.item.name) || a.item.id.localeCompare(b.item.id))
      .map((x) => x.item.name),
  );
  const tied = [
    { ...entries[0], item: { ...entries[0].item, id: 'b', name: 'same' } },
    { ...entries[0], item: { ...entries[0].item, id: 'a', name: 'same' } },
  ] as LibraryEntry[];
  assert.deepEqual(
    sortLibraryEntries(tied, 'name', 'tr').map((x) => x.item.id),
    ['a', 'b'],
  );
  assert.deepEqual(
    entries.map((x) => x.item.name),
    ['z', 'ä', 'a'],
  );
});
test('MapLibre owns marker positions while map labels can refresh in place', () => {
  const locale = mapLibreLocale((key) => `localized ${key}`);
  assert.equal(locale['Map.Title'], 'localized map');
  assert.equal(locale['AttributionControl.ToggleAttribution'], 'localized attribution');
  const attributes = new Map<string, string>();
  const node = { setAttribute: (key: string, value: string) => attributes.set(key, value) };
  const container = { querySelector: () => node };
  updateMapLabels(container as never, (key) => `new ${key}`);
  assert.equal(attributes.get('aria-label'), 'new attribution');
  assert.equal(attributes.get('title'), 'new attribution');
  assert.equal(attributes.has('style'), false);
});
