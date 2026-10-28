import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const catalog = readFileSync(new URL('./LibraryCatalog.tsx', import.meta.url), 'utf8');
const rowLinks = [
  ...catalog.matchAll(/<Link\s+className="library-item-main library-columns"([\s\S]*?)<\/Link>/g),
];

// Source guard only; the browser accessibility tree is verified separately.
test('library row links use their visible name, type and details without a label override', () => {
  assert.equal(rowLinks.length, 2);
  for (const [, link] of rowLinks) {
    const openingTag = link.slice(0, link.indexOf('\n      >'));
    assert.doesNotMatch(openingTag, /aria-label(?:ledby)?\s*=/);
    assert.match(link, /className="library-item-kind"/);
    assert.match(link, /className="library-item-meta"/);
    assert.ok(link.includes("{t('openOnMap')}"));
  }
});

test('place and route links retain stable-ID targets and distinguishing visible details', () => {
  assert.equal(rowLinks.length, 2);
  const place = rowLinks[0][1];
  const route = rowLinks[1][1];
  assert.ok(place.includes(`kind=places&selected=\${encodeURIComponent(place.id)}`));
  assert.ok(place.includes('{place.name}'));
  assert.ok(place.includes("{t('place')}"));
  assert.ok(place.includes('{formatCoord(place.latitude)}, {formatCoord(place.longitude)}'));
  assert.ok(route.includes(`kind=routes&selected=\${encodeURIComponent(route.id)}`));
  assert.ok(route.includes('{route.name}'));
  assert.ok(route.includes("{t('route')}"));
  assert.ok(
    route.includes(
      '{formatRouteDistanceFromWaypoints(route.currentRevision?.waypoints ?? [], locale)}',
    ),
  );
  assert.ok(route.includes('{formatMode(route.mode, tm)}'));
});
