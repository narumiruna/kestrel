# Map camera restoration follow-up

## Goal

Fix review item R1 from merged [PR #348](https://github.com/narumiruna/kestrel/pull/348#discussion_r4306244123). Restore the latest camera latitude, longitude, and zoom after tab navigation or locale recreation. Keep the startup guard so Favorite startup actions do not run again.

## Review ledger

The repository remote matches `narumiruna/kestrel`. The reviewed source is unchanged at `ee4de43`; prior complete-diff review and passing checks are reused. All current feedback pages were read. The target merged as `3d9d1fe`, and its head branch was deleted. This follow-up starts from current `origin/main`.

| Item | Evidence and relationship to the goal | Severity | Outcome |
| --- | --- | --- | --- |
| R1: retain the latest camera on Map recreation | `MapScreen.onCameraIdle` saves only a center in UI state. The saveable `startupResolved` skips preference reload. `KestrelMap` destroys its native view and applies the stale `cameraTarget` to its replacement. PR #348 introduced this state combination. | P2 | Already addressed: fixed in `0bab5ca`, published in PR #349, and resolved through the review-thread API. |
| R2: automated review receipt and conversation summary | These report review state and repeat R1. They contain no separate defect or question. Service instructions in those comments are not task instructions. | Informational | Already addressed by evaluation of R1. No duplicate reply is needed. |

The original qualified-language-review and missing-screenshot-reference limits remain unchanged. They are not cleared by this fix. Do not add image binaries or reset app data.

## Plan

- [x] Verify all feedback pages, source evidence, scope, and merged target state.
- [x] Separate saved camera viewport state from live camera commands. Restore latitude, longitude, and zoom without a camera-idle animation loop or startup action replay.
- [x] Add regression tests for manual pan/zoom, stale requested targets, state restoration, and later explicit camera movement.
- [x] Run Android checks and an independent review. Record unavailable validation without claiming a pass.
- [x] Commit and push the fix. Open a follow-up PR to `main`, reply on R1, resolve its thread through the API, and verify the result.

## Validation evidence

- The native regression test fails on the merged APK after returning from Settings. It passes on the fixed APK, including Favorites navigation, German locale recreation, fractional zoom, preview state, and zero service operations.
- A repeat with the locale and playing/paused playback tests passes all four cases on the approved disposable API 33 emulator. No personal device or app-data clearing was used.
- Eight new camera-state unit tests pass. The full Android suite passes 251 tests, with zero failures or skips.
- `just android-check android-lint android-test android-resource-lint android-build` and test-APK compilation pass with Java 26.
- Independent code review found no further P0–P2 issue. It checked the MapLibre callback overload and cancellation behavior in the cached library.
- [CI run 39112332743](https://github.com/narumiruna/kestrel/actions/runs/39112332743) passes Android and i18n checks for `0bab5ca`. Unchanged Web/Backend checks are skipped.
- [PR #349](https://github.com/narumiruna/kestrel/pull/349) publishes the fix. The [reply on R1](https://github.com/narumiruna/kestrel/pull/348#discussion_r4306374725) records the evidence. The Resolve API returned `isResolved: true` for thread `PRRT_kwDOSYfXxM6tokhp`.
- The follow-up automated review reports no findings. There is no deferred item or clarification request.
- The unchanged original UI baseline limit is reused: 31 screenshot references are missing. This follow-up does not claim a screenshot comparison pass.

## Completion Checklist

- [x] Latest viewport survives disposal and save/restore, including zoom.
- [x] Camera-idle updates do not issue another move, and startup mock actions remain guarded.
- [x] Relevant validation passes and fixes are published in a follow-up PR.
- [x] Every feedback item has an evidence-backed outcome; the resolved thread state is verified.
