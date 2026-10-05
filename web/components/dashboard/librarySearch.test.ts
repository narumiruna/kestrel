import assert from 'node:assert/strict';
import test from 'node:test';
import type { Place, Route } from '@/lib/api';
import { matchesPlaceSearch, matchesRouteSearch } from './librarySearch.ts';

const place = (id: string, name: string, description: string | null, tags: string[]): Place =>
  ({ id, name, description, tags }) as Place;
const route = (id: string, name: string, description: string | null, mode: Route['mode']): Route =>
  ({ id, name, description, mode }) as Route;

const places = [
  place('first', 'Taipei', null, ['Night Market']),
  place('second', 'Harbor', 'Quiet notes', []),
  place('third', 'TAIPEI East', null, ['photo']),
];
const routes = [
  route('loop', 'Harbor trail', null, 'LOOP'),
  route('once', 'Morning', 'quiet NOTES', 'ONCE'),
  route('ping', 'Round trip', null, 'PING_PONG'),
];

test('saved place matching retains substring, case, tags, notes and original order', () => {
  for (const [query, expected] of [
    ['', ['first', 'second', 'third']],
    ['taipei', ['first', 'third']],
    ['night market', ['first']],
    ['quiet', ['second']],
    ['missing', []],
  ] as const) {
    assert.deepEqual(
      places.filter((item) => matchesPlaceSearch(item, query)).map((item) => item.id),
      expected,
    );
  }
});

test('saved route matching includes formatted mode, null descriptions and order', () => {
  for (const [query, expected] of [
    ['', ['loop', 'once', 'ping']],
    ['harbor', ['loop']],
    ['quiet notes', ['once']],
    ['ping-pong', ['ping']],
    ['loop', ['loop']],
    ['missing', []],
  ] as const) {
    assert.deepEqual(
      routes.filter((item) => matchesRouteSearch(item, query)).map((item) => item.id),
      expected,
    );
  }
});

test('both screens normalize surrounding whitespace before matching', () => {
  const query = '  NIGHT MARKET  '.trim().toLowerCase();
  assert.deepEqual(
    places.filter((item) => matchesPlaceSearch(item, query)).map((item) => item.id),
    ['first'],
  );
});
