# Cloud workspace UI/UX

## Goal

Improve route visibility, library scanning, and account security discoverability without changing APIs, permissions, or manual-save semantics.

## Context

The Web uses Next.js, Radix Themes and Primitives, Radix Icons, and MapLibre GL.
Route drafts already have stable `draftId` identities and undo/redo, but selection is currently stored as an array index.
Routes are saved explicitly; the header reports refresh time rather than save status.
Playback commands target Android devices and do not provide local seek or simulated progress.
Library already mixes item types using `Intl.Collator` sorting and supports independent load errors.
Account security already uses the shared header, real sessions and devices, OIDC linking, QR login, and a password dialog.
The server requires new passwords of 12–256 characters.

## Plan

- [x] Inspect current components, tokens, map interactions, APIs, and test commands.
- [x] Separate route overview, point editing, and explicit map insertion while preserving manual saves and undo/redo.
- [x] Preserve waypoint selection by draft identity through path changes and test identity reconciliation.
- [x] Refine shared surfaces, compact library rows, and account section navigation and password actions.
- [x] Run Web formatting, lint, typecheck, state tests, and build.
- [x] Review 1440, 1024, 768, and 390 px layouts with Chrome DevTools, including 94-point routes, long names, and password expansion.

## Completion Checklist

- [x] Route overview avoids overlapping number stacks and all points remain accessible in the list.
- [x] Selection, explicit insertion, reorder, removal, and undo/redo have relevant regression coverage.
- [x] Library search/filter/sort and independent actions remain intact.
- [x] Account status is API-backed and password cancellation clears sensitive fields.
- [x] Validation evidence and any environmental blockers are reported, with screenshots outside the repository.

## Verification

`just web-check`, `just web-lint`, `just web-typecheck`, `just web-build`, and `git diff --check` pass.
The Web state suite passes all 62 tests, including 94-point identity reconciliation and overview marker coverage.
Biome reports 44 existing specificity warnings in unchanged legacy CSS files.
Chrome DevTools Protocol checks cover all requested widths with no horizontal overflow or application console errors in the exercised scenarios.
The overview fixture shows two endpoints initially and retains all 94 waypoint rows.
Browser checks cover dragging and undo, explicit insertion and cancellation, reorder, duplication, deletion and undo, manual saving, keyboard menus and tabs, share-dialog focus restoration, and scrollable mobile panels.
Library checks cover mixed sorting, combined Unicode search and type filtering, long names and URLs, loading, server error, empty data, and no matching results.
Password checks cover collapsed defaults, expansion, cancellation, mismatched confirmation, server errors, disabled controls during submission, and successful clearing and collapse.
Sampled body, metadata, navigation, and route-mode text contrast ratios exceed 4.5:1 after correcting the selected route-mode color.
Screenshots and test reports are saved outside Git under `/tmp/kestrel-ux-*`.

## Validation Boundary

Browser API responses use isolated validation fixtures because no local Backend is running.
These fixtures exist only in external DevTools scripts and are not part of application code or persisted server data.
Live Pocket ID linking, session and device revocation, QR handoff to Android, and physical remote playback were not executed.
Their existing API and permission flows remain unchanged.
No Backend, database schema, API format, authentication policy, or Android device state was changed.
