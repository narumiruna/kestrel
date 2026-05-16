# Route progress write cadence setting plan

## Goal

Expose `LocationService`'s route progress write cadence as an Options setting so the user can trade rollback budget against DataStore write frequency without rebuilding the app. Default stays at 5 s; the setting is a tweak knob, not a required step.

## Context

PR #52 (`feat(location): persist route progress across service kill`) writes `MockState.route.progressMeters` + `forward` from the route loop. The plan that shipped that work (`docs/plans/archived/2026-05-11_route-progress-persistence-plan.md`) flagged the original 5 s cadence as the sole knob: raising it halves write volume and widens the post-kill rollback window proportionally.

The Options screen (`feature/options/OptionsScreen.kt`) already follows a clear pattern:

- `@Serializable` data class in `core/data/Preferences.kt`.
- `Flow<X>` reader + `suspend fun setX(...)` writer in `KestrelPrefs`.
- A section composable in `OptionsScreen.kt` mirroring `CloudSettingsSection` / `StartupPreference` UI.

`LocationService` reads other prefs via `prefs.someSetting.first()`; the same pattern fits here.

## Non-Goals

- Do not expose `LOCATION_SERVICE_TICK_MILLIS` (the route loop's tick interval). Decoupling that needs its own analysis and is unrelated to the persist cadence.
- Do not change the in-flight engine behavior. The setting takes effect on the next `ACTION_START_ROUTE` (and on `restoreState()`), not mid-route. Reapplying live would require restarting the persist counter, which adds complexity without a real use case.
- Do not expose this as a per-route field. It is a global service preference.
- Do not migrate any existing persisted state. The new pref is additive with a default.

## Assumptions

- The user wants seconds, not ticks. Internally the service still uses tick counts; the setting carries seconds and the service converts.
- A small integer slider or number field (1 s – 60 s) is sufficient UI. No need for sub-second precision.
- 0 s ("write every tick") is intentionally excluded; if requested later, add it as a separate "always" toggle rather than a magic 0 value.

## Plan

- [x] Add `progressWriteIntervalSeconds: Int = 5` to a new or existing settings data class in `app/src/main/java/dev/narumi/kestrel/core/data/Preferences.kt`. Keep it independent from `CloudSettings` so unrelated cloud changes do not invalidate the value; either extend an existing "mock playback" setting class or introduce `MockPlaybackSettings`. Verify backward compatibility with a unit test under `app/src/test/java/dev/narumi/kestrel/core/data/` that decodes a legacy JSON blob lacking the field and gets the default.
- [x] Add `val mockPlaybackSettings: Flow<MockPlaybackSettings>` and `suspend fun setProgressWriteIntervalSeconds(seconds: Int)` to `KestrelPrefs`, clamping the input into `[1, 60]` server-side. Verified by inspection of the DataStore setter plus the real-device smoke, because the existing JVM unit-test harness cannot instantiate Android `Context` for a `KestrelPrefs` round trip.
- [x] Update `LocationService.startRoute` to read the configured interval at route start (via `prefs.mockPlaybackSettings.first()`) and pass it into the loop as a local `val progressWriteIntervalTicks`. Keep the old fixed progress-write constant removed. Verified with a focused unit test that asserts the conversion math (seconds=10 + `LOCATION_SERVICE_TICK_MILLIS`=1000 → 10 ticks).
- [x] Update `restoreState()`'s Route branch to use the same read path so a kill-restart honors the latest setting. Verified by inspection: both `ACTION_START_ROUTE` and restore call `startRoute`, whose route job reads `prefs.mockPlaybackSettings.first()` once before the loop.
- [x] Add an Options section in `feature/options/OptionsScreen.kt` ("Mock playback") with a 1 s stepper bound to `progressWriteIntervalSeconds` (range 1 – 60), default 5, and a short explanation that higher values reduce writes but widen rollback after a kill. Verified by debug build; a `MockPlaybackSettingsCardPreview` was added so Android Studio preview can render the section.
- [x] Run `just check`, `just lint`, and `JAVA_HOME=… ./gradlew :app:testDebugUnitTest`; record commit hash + results in this plan.
- [x] Manual smoke on a real device: change the setting to 10 s, start a PingPong route, SIGKILL via `run-as dev.narumi.kestrel kill -9 <pid>`, verify the new pid resumes with rollback ≤ 10 s × speed (versus ≤ 5 s × speed at the default). Record date + commit hash here.
- [x] Update the `## GOTCHA` entry in `docs/MEMORY.md` from "5 s" to point at the new setting and note that the rollback budget is now configurable.

## Risks

- **Off-by-tick conversion.** `seconds * 1000 / LOCATION_SERVICE_TICK_MILLIS` must guard against the service tick ever changing. The math test covers this; keep `LOCATION_SERVICE_TICK_MILLIS` as the source of truth, not a hard-coded tick count.
- **User picks a very large value and forgets.** Worst case after an overnight kill the dot reappears tens of meters off. Documented in the Options helper text; not a correctness bug.
- **Stepper UX precision.** A 1-second step over 1–60 might feel repetitive near the high end. Acceptable for a tweak knob; revisit only if user feedback says otherwise.

## Verification

- Code/CI verification on local working tree based on `e27a8aa` (final PR commit hash to be assigned):
  - `just check` — PASS (`spotlessCheck` + `web-check`)
  - `just lint` — PASS (`detekt` + `web-lint`)
  - `just android-build` — PASS (`:app:assembleDebug`, includes `MockPlaybackSettingsCardPreview` compilation)
  - `JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home" PATH="/Applications/Android Studio.app/Contents/jbr/Contents/Home/bin:$PATH" ./gradlew :app:testDebugUnitTest` — PASS
- Real-device smoke on 2026-05-16, device `ZY32L6DLW8`, debug APK from the local working tree based on `e27a8aa`:
  - Default 5 s cadence: persisted `progressMeters` stayed `0.0` through t=5.51 s and became `50.0` m at t=6.61 s on a 36 km/h route.
  - Configured 10 s cadence: persisted `progressMeters` stayed `0.0` through t=11.05 s and became `100.0` m at t=12.13 s.
  - SIGKILL restore: `run-as dev.narumi.kestrel kill -9 6489` restarted as pid `7952`; immediate persisted progress was `100.0` m, then advanced to `200.0` m after 10.81 s, proving restart resumed from the latest 10 s snapshot. Rollback at kill was ≤ 10 s × 10 m/s = 100 m.
  - App prefs were restored after the smoke; no `pm clear`/uninstall was used.

## Completion Checklist

- [x] `progressWriteIntervalSeconds` is persisted in DataStore with a default of `5` and a legacy-decode test proving older payloads still load, verified by `:app:testDebugUnitTest`.
- [x] `LocationService` reads the setting at `ACTION_START_ROUTE` and inside `restoreState()`, with a unit test asserting the seconds → ticks conversion against `LOCATION_SERVICE_TICK_MILLIS`.
- [x] Options screen exposes the setting with a 1 – 60 s range, default 5, and inline explanation, verified by `just check`, `just lint`, and debug build / Android Studio preview compilation.
- [x] Setting the value to 10 s on a real device makes the persisted `progressMeters` advance by ~10 s of motion between writes (vs. ~5 s at default), verified by polling `mock_state_json` via `adb shell run-as … cat … | strings` / DataStore protobuf parsing and recorded above.
- [x] `docs/MEMORY.md` GOTCHA entry references the new setting instead of a hard-coded 5 s, verified by searching for the removed fixed progress-write constant name and finding no stale references.
