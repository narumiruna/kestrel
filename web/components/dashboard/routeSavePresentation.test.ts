import assert from 'node:assert/strict';
import test from 'node:test';
import { getRouteSavePresentation } from './routeSavePresentation.ts';

const cleanExisting = {
  changeSummary: '',
  error: null,
  isDirty: false,
  isNew: false,
  isSaving: false,
  revisionNumber: 4,
  saveNotice: null,
  validationReason: null,
};

test('presents a new empty route as not saved with its first validation reason', () => {
  const presentation = getRouteSavePresentation({
    ...cleanExisting,
    isNew: true,
    revisionNumber: null,
    validationReason: 'Enter a route name before saving.',
  });

  assert.equal(presentation.title, 'Not saved yet');
  assert.equal(presentation.detail, 'Enter a route name before saving.');
  assert.equal(presentation.showSaveButton, true);
  assert.equal(presentation.showStickyBar, true);
});

test('keeps a clean saved route compact without a disabled save action', () => {
  const presentation = getRouteSavePresentation(cleanExisting);

  assert.equal(presentation.title, 'Saved to cloud');
  assert.equal(presentation.detail, 'Revision 4');
  assert.equal(presentation.showSaveButton, false);
  assert.equal(presentation.showStickyBar, false);
});

test('distinguishes invalid and valid dirty drafts', () => {
  const invalid = getRouteSavePresentation({
    ...cleanExisting,
    changeSummary: 'Path changed',
    isDirty: true,
    validationReason: 'Add 1 more waypoint before saving.',
  });
  const valid = getRouteSavePresentation({
    ...cleanExisting,
    changeSummary: 'Path changed',
    isDirty: true,
  });

  assert.equal(invalid.title, 'Not ready to save');
  assert.equal(invalid.detail, 'Add 1 more waypoint before saving.');
  assert.equal(invalid.status, 'error');
  assert.equal(valid.title, 'Unsaved changes');
  assert.equal(valid.detail, 'Path changed');
  assert.equal(valid.status, 'warning');
  assert.equal(valid.showDiscard, true);
});

test('prevents duplicate submission while saving', () => {
  const presentation = getRouteSavePresentation({
    ...cleanExisting,
    isDirty: true,
    isSaving: true,
  });

  assert.equal(presentation.title, 'Saving route…');
  assert.equal(presentation.status, 'progress');
  assert.equal(presentation.showDiscard, false);
  assert.equal(presentation.showSaveButton, true);
});

test('reports success as a compact saved state', () => {
  const presentation = getRouteSavePresentation({
    ...cleanExisting,
    saveNotice: 'Saved just now.',
  });

  assert.equal(presentation.title, 'Saved just now.');
  assert.equal(presentation.showStickyBar, false);
  assert.equal(presentation.showSaveButton, false);
});

test('keeps retry and discard available after a save error', () => {
  const presentation = getRouteSavePresentation({
    ...cleanExisting,
    error: 'Network unavailable.',
    isDirty: true,
  });

  assert.equal(presentation.title, 'Route not saved');
  assert.equal(presentation.detail, 'Network unavailable.');
  assert.equal(presentation.status, 'error');
  assert.equal(presentation.showDiscard, true);
  assert.equal(presentation.showSaveButton, true);
});
