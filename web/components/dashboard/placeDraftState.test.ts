import assert from 'node:assert/strict';
import test from 'node:test';
import type { Place } from '../../lib/api.ts';
import { getPlacePreviewCoordinates } from './placeCoordinates.ts';
import {
  applyPlaceMapCoordinates,
  createPlaceDraftState,
  discardPlaceDraft,
  isPlaceDraftDirty,
  rebasePlaceDraftAfterSave,
  refreshPlaceDraft,
} from './placeDraftState.ts';

const place: Place = {
  createdAt: '2026-01-01T00:00:00Z',
  deletedAt: null,
  description: 'Saved description',
  id: 'place-1',
  latitude: 25,
  libraryItem: null,
  longitude: 121,
  name: 'Entrance',
  tags: ['park'],
  updatedAt: '2026-01-01T00:00:00Z',
};
const coords = { latitude: 25, longitude: 121 };
const refreshedPlace = {
  ...place,
  description: 'Server description',
  latitude: 26,
  longitude: 122,
  name: 'Server name',
  tags: ['server'],
  updatedAt: '2026-01-02T00:00:00Z',
};

test('same-ID refresh preserves every dirty local field and the original discard baseline', () => {
  const initial = createPlaceDraftState(place, coords);
  for (const field of ['name', 'description', 'tags', 'latitude', 'longitude'] as const) {
    const dirty = { ...initial, draft: { ...initial.draft, [field]: '-' } };
    assert.equal(isPlaceDraftDirty(dirty), true, field);
    const refreshed = refreshPlaceDraft(dirty, refreshedPlace);
    assert.equal(refreshed, dirty, field);
    assert.deepEqual(discardPlaceDraft(refreshed).draft, initial.baseline, field);
    assert.equal(isPlaceDraftDirty(discardPlaceDraft(refreshed)), false, field);
  }
});

test('clean same-ID refresh updates fields and baseline, but selection changes start a new draft', () => {
  const initial = createPlaceDraftState(place, coords);
  const refreshed = refreshPlaceDraft(initial, refreshedPlace);
  assert.equal(refreshed.draft.name, 'Server name');
  assert.equal(refreshed.draft.latitude, '26.000000');
  assert.deepEqual(refreshed.draft, refreshed.baseline);
  assert.equal(isPlaceDraftDirty(refreshed), false);

  const dirty = { ...initial, draft: { ...initial.draft, name: 'Local name' } };
  const selected = refreshPlaceDraft(dirty, { ...refreshedPlace, id: 'place-2' });
  assert.equal(selected.placeId, 'place-2');
  assert.equal(selected.draft.name, 'Server name');
  assert.equal(isPlaceDraftDirty(selected), false);
  const newSelection = refreshPlaceDraft(dirty, null);
  assert.equal(newSelection.placeId, null);
  assert.equal(newSelection.draft.name, '');
  assert.equal(isPlaceDraftDirty(newSelection), false);
});

test('new-place refresh preserves dirty text and initial coordinate baseline', () => {
  const initial = createPlaceDraftState(null, coords);
  const dirty = { ...initial, draft: { ...initial.draft, name: 'New place', latitude: '-' } };
  assert.equal(refreshPlaceDraft(dirty, null), dirty);
  assert.equal(refreshPlaceDraft(initial, null), initial);
  assert.deepEqual(discardPlaceDraft(dirty).draft, initial.baseline);
});

test('invalid coordinate text stays dirty and editable without producing a map preview', () => {
  for (const latitude of ['100', '-', '', 'latitude100']) {
    const initial = createPlaceDraftState(place, coords);
    const state = { ...initial, draft: { ...initial.draft, latitude } };
    assert.equal(getPlacePreviewCoordinates(state.draft.latitude, state.draft.longitude), null);
    assert.equal(refreshPlaceDraft(state, refreshedPlace).draft.latitude, latitude);
    assert.equal(isPlaceDraftDirty(state), true);
    const corrected = { ...state, draft: { ...state.draft, latitude: '25.01' } };
    assert.deepEqual(
      getPlacePreviewCoordinates(corrected.draft.latitude, corrected.draft.longitude),
      {
        latitude: 25.01,
        longitude: 121,
      },
    );
  }
  const zero = createPlaceDraftState({ ...place, latitude: 0 }, coords);
  assert.equal(isPlaceDraftDirty({ ...zero, draft: { ...zero.draft, latitude: '' } }), true);
});

test('coordinate-only map updates apply without changing metadata or baseline, and stabilize', () => {
  const initial = createPlaceDraftState(place, coords);
  const dirty = { ...initial, draft: { ...initial.draft, name: 'Local name', latitude: '-' } };
  const mapCoords = { latitude: 26.012345, longitude: 122 };
  const updated = applyPlaceMapCoordinates(dirty, mapCoords);
  assert.equal(updated.draft.latitude, '26.012345');
  assert.equal(updated.draft.longitude, '122.000000');
  assert.equal(updated.draft.name, 'Local name');
  assert.equal(updated.baseline, initial.baseline);
  assert.equal(applyPlaceMapCoordinates(updated, { ...mapCoords }), updated);
  assert.equal(applyPlaceMapCoordinates(dirty, { latitude: 100, longitude: 121 }), dirty);
  assert.equal(applyPlaceMapCoordinates(dirty, { latitude: 25, longitude: Number.NaN }), dirty);
});

test('normalized values remain clean without treating incomplete coordinate text as zero', () => {
  const state = createPlaceDraftState(place, coords);
  const normalized = {
    ...state,
    draft: {
      ...state.draft,
      description: ' Saved description ',
      latitude: '25',
      longitude: '121.0',
      name: ' Entrance ',
      tags: 'park, , ',
    },
  };
  assert.equal(isPlaceDraftDirty(normalized), false);
});

test('save rebases unchanged fields while preserving edits made during the request', () => {
  const initial = createPlaceDraftState(place, coords);
  const submitted = {
    ...initial,
    draft: { ...initial.draft, name: 'Submitted', tags: 'submitted' },
  };
  const saved = { ...place, name: 'Submitted', tags: ['submitted'] };
  const current = {
    ...submitted,
    draft: { ...submitted.draft, description: 'Later details', latitude: '-', tags: 'later' },
  };
  const rebased = rebasePlaceDraftAfterSave(current, submitted, saved);
  assert.equal(rebased.baseline.name, 'Submitted');
  assert.equal(rebased.draft.description, 'Later details');
  assert.equal(rebased.draft.latitude, '-');
  assert.equal(rebased.draft.tags, 'later');
  assert.equal(isPlaceDraftDirty(rebased), true);
  assert.deepEqual(discardPlaceDraft(rebased).draft, createPlaceDraftState(saved, coords).baseline);
  const clean = rebasePlaceDraftAfterSave(submitted, submitted, saved);
  assert.equal(isPlaceDraftDirty(clean), false);
  assert.equal(refreshPlaceDraft(clean, saved).draft.name, 'Submitted');
});

test('successful legacy void saves establish a baseline and new saves use the returned ID', () => {
  const initial = createPlaceDraftState(null, coords);
  const submitted = { ...initial, draft: { ...initial.draft, name: 'Created' } };
  const legacySaved = rebasePlaceDraftAfterSave(submitted, submitted);
  assert.equal(isPlaceDraftDirty(legacySaved), false);
  assert.equal(legacySaved.baseline.name, 'Created');
  const saved = { ...place, name: 'Created' };
  const created = rebasePlaceDraftAfterSave(submitted, submitted, saved);
  assert.equal(created.placeId, saved.id);
  assert.equal(isPlaceDraftDirty(created), false);
  assert.deepEqual(created.baseline, refreshPlaceDraft(created, saved).baseline);
});
