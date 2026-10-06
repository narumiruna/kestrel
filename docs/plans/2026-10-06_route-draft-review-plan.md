# Route draft review fixes

## Goal

Address all in-scope feedback on PR #331 without changing APIs, manual saving, or waypoint history semantics.

## Review Ledger

| Item | Evidence and relationship to PR goal | Severity | Initial outcome |
| --- | --- | --- | --- |
| [Save selection](https://github.com/narumiruna/kestrel/pull/331#discussion_r4190764279) | `rebaseRouteDraftAfterSave` generates new revision IDs while selection retains the old draft ID; the clean refresh effect recreates those IDs again, contradicting stable selection. | P2 | Actionable and not yet addressed. |
| [Drag overwrites fields](https://github.com/narumiruna/kestrel/pull/331#discussion_r4190764281) | Marker drag listeners capture a callback when the path array changes; metadata edits retain that array, and the callback introduced in this PR replaces current state with its older capture. | P1 | Actionable and not yet addressed. |
| Submitted review and activity summary | These contain review metadata and link to the two findings above, with no additional request. | Informational | No independent actionable item. |

## Plan

- [x] Confirm repository and branch identity, read the complete diff and every feedback page, and independently trace both findings.
- [x] Preserve submitted waypoint identities through save rebasing and unchanged-path refreshes, including edits during a pending save.
- [x] Make imperative marker drag listeners invoke the current callback and reproduce field retention in Chrome DevTools.
- [x] Add state regression tests and run Web formatting, lint, typecheck, tests, and build.
- [ ] Publish a signed fix, reply with evidence to both review threads, resolve them after publication, and refresh checks.

## Completion Checklist

- [x] Selected waypoint identity survives new revision responses and the subsequent refresh without hiding later path edits.
- [x] Metadata edits survive a real marker drag, and path undo/redo remains available.
- [ ] Relevant local validation passes and all known feedback has a published outcome.

## Evidence

Before the fix, Chrome reproduced name rollback after a real waypoint drag and zero selected rows or markers after saving a new revision.
After the fix, all five metadata fields survive dragging, undo/redo, saving, and refresh while waypoint 47 remains selected.
A delayed save followed by a name edit and waypoint reorder preserves the late name and selection at position 46, with undo/redo restoring positions 47 and 46.
Four added state tests cover existing and new route saves, clean refreshes, changed remote paths, allocation, and concurrent reorder history.
The complete Web suite passes all 66 tests.
`just web-check`, `just web-lint`, `just web-typecheck`, `just web-build`, and `git diff --check` pass with the same 44 existing CSS warnings.
Chrome verification at 1440 × 900 reports no application console errors or horizontal overflow in successful regression runs.
Backend `library.service.ts` assigns submitted waypoint positions as saved sequences, supporting identity preservation by submitted position.

## Validation Boundary

Browser checks use isolated external DevTools fixtures rather than a live Backend or Android device.
The fixture must change the revision ID on every save, unlike the original UI validation fixture.
Images and unrelated `PLAN.md` remain outside the commit.
