# Live route settings

## Goal

Allow changing speed and Once / Loop / Ping-pong during route playback or pause, without restarting the route, jumping to its first waypoint, or modifying a replacement preview.

## Architecture

- Add a partial settings operation to `LocationService`, scoped to a runtime-only playback ID. Delayed requests must not edit a newly replaced/restored route.
- Mutate the existing movement engine under the provider/tick lock; preserve progress and pause state. Speed-only changes preserve Ping-pong direction. Once and Loop move toward the route's final waypoint; switching away from reverse Ping-pong changes direction without changing position.
- Publish current settings through `LocationService.runtimeState`. Keep active route settings separate from draft settings in Compose.
- Serialize service persistence and snapshot the current state after acquiring the persistence lock, so delayed writes cannot restore old settings or an old route. Acknowledge settings after persistence; report persistence failure without hiding the already-applied runtime change.
- Keep existing DataStore schema and forward-compatible serialization. Playback IDs are not stored.

## Plan

- [x] Add in-place movement settings updates and a guarded active-route snapshot; `LiveRouteSettingsTest`, `MovementEngineTest`, and `ActiveRouteSnapshotTest` pass, including progress, direction, invalid input, old playback IDs, pause publication, restore, and multi-bounce Ping-pong.
- [x] Wire and inspect the service operation, synchronized tick/finish transitions, runtime publication, serialized persistence, and stop/replacement/restore paths. `:app:compileDebugAndroidTestKotlin` passes. Requests bind to the playback ID rendered by Compose, not a later replacement before the next frame.
- [x] Add live settings below playback controls, with busy-state disabling and independent preview controls; presentation-rule tests pass and narrow/large-text/dark/pending previews have been inspected.
- [x] Android formatting, Detekt, all JVM tests, local-reference preview validation, and debug build pass; all generated images remain outside the repository.

## Non-Goals

- No backend/Web command API changes, new speed-entry workflow, saved Favorite edits, database migration, or altered pause-after-process-death behavior.
- No phone installation, mock-state manipulation, or connected instrumentation without fresh approval.

## Completion Checklist

- [x] Speed and mode updates mutate the same engine without stop/start; progress and next samples are covered by JVM tests.
- [x] Pause state is retained in service state and runtime publication; stale/invalid requests are rejected before engine mutation.
- [x] Active callbacks dispatch partial service updates; preview callbacks only edit draft variables. All settings choices disable while pending; timeout handling no longer clears drafts for non-replacement operations.
- [x] `MockStateWriterTest` verifies current-state snapshots after queued writes, route stop/replacement, and write failure. Service snapshot/tick/update/completion paths share the provider lock; initialized-state guarding prevents a failed startup from clearing recovery data.
- [x] All 172 JVM tests pass (32 suites; no failures or skips), including malformed update extras, zero-length routes, and cancelled persistence snapshots. `just android-check`, `just android-lint`, and `just android-build` pass with Java 26.
- [x] `git diff --check` passes; no image binaries are included in Git changes. Previous visual-polish changes remain intact.

## Validation Evidence

- Debug APK: `app/build/outputs/apk/debug/app-debug.apk`.
- Thirty Compose previews render and validate against new local-only references. Reviewed playing/paused panels, light/dark settings, large text, and disabled controls; source review confirms independent replacement settings. These references are for this change's local review, not an approved historical regression baseline.
- Images and screenshot validation XML: `/tmp/kestrel-live-route-settings/review/`. Screenshot tasks used `--init-script /tmp/kestrel-live-route-settings/screenshots.init.gradle` to redirect generated files outside the repository.
- New `LiveRouteSettingsInteractionTest` covers callback dispatch, confirmed selections, and pending-state disabling. It compiles but was not run: connected instrumentation and physical mock-state changes need separate approval.
- After fresh user approval, the APK was installed with `adb install -r` on the connected moto g34 5G. Local data was backed up first and the installed APK digest matches the build. Database/WAL files were unchanged; DataStore remained present but changed during active playback. No uninstall, data clearing, app launch, or connected instrumentation was performed; live-control behavior on the phone remains unverified.
- Existing draft speed presets are retained; a non-preset current speed is also shown. On compact phones, live settings are in the existing expandable playback sheet below Pause/Stop; no extra settings screen or apply action was added.
