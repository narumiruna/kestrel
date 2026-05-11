# Route progress write cadence setting plan

## Goal

Expose `LocationService`'s `PROGRESS_WRITE_INTERVAL_TICKS` (currently a hard-coded `5`, i.e. 5 s at the 1 s tick rate) as an Options setting so the user can trade rollback budget against DataStore write frequency without rebuilding the app. Default stays at 5 s; the setting is a tweak knob, not a required step.

## Context

PR #52 (`feat(location): persist route progress across service kill`) writes `MockState.route.progressMeters` + `forward` every `PROGRESS_WRITE_INTERVAL_TICKS` ticks in `LocationService`. The plan that shipped that work (`docs/plans/archived/2026-05-11_route-progress-persistence-plan.md`) flagged this constant as the sole knob: raising it halves write volume and widens the post-kill rollback window proportionally.

Today the constant is `private const val` inside `LocationService.Companion`. No UI, no preference.

The Options screen (`feature/options/OptionsScreen.kt`) already follows a clear pattern:

- `@Serializable` data class in `core/data/Preferences.kt`.
- `Flow<X>` reader + `suspend fun setX(...)` writer in `KestrelPrefs`.
- A section composable in `OptionsScreen.kt` mirroring `CloudSettingsSection` / `StartupPreference` UI.

`LocationService` reads other prefs via `prefs.someSetting.first()`; the same pattern fits here.

## Non-Goals

- Do not expose `TICK_MILLIS` (the route loop's tick interval). Decoupling that needs its own analysis and is unrelated to the persist cadence.
- Do not change the in-flight engine behavior. The setting takes effect on the next `ACTION_START_ROUTE` (and on `restoreState()`), not mid-route. Reapplying live would require restarting the persist counter, which adds complexity without a real use case.
- Do not expose this as a per-route field. It is a global service preference.
- Do not migrate any existing persisted state. The new pref is additive with a default.

## Assumptions

- The user wants seconds, not ticks. Internally the service still uses tick counts; the setting carries seconds and the service converts.
- A small integer slider or number field (1 s – 60 s) is sufficient UI. No need for sub-second precision.
- 0 s ("write every tick") is intentionally excluded; if requested later, add it as a separate "always" toggle rather than a magic 0 value.

## Plan

- [ ] Add `progressWriteIntervalSeconds: Int = 5` to a new or existing settings data class in `app/src/main/java/dev/narumi/kestrel/core/data/Preferences.kt`. Keep it independent from `CloudSettings` so unrelated cloud changes do not invalidate the value; either extend an existing "mock playback" setting class or introduce `MockPlaybackSettings`. Verify backward compatibility with a unit test under `app/src/test/java/dev/narumi/kestrel/core/data/` that decodes a legacy JSON blob lacking the field and gets the default.
- [ ] Add `val mockPlaybackSettings: Flow<MockPlaybackSettings>` and `suspend fun setProgressWriteIntervalSeconds(seconds: Int)` to `KestrelPrefs`, clamping the input into `[1, 60]` server-side. Verify with a small KestrelPrefs round-trip test or by inspection if no test harness exists for `KestrelPrefs`.
- [ ] Update `LocationService.startRoute` to read the configured interval at route start (via `prefs.mockPlaybackSettings.first()`) and pass it into the loop as a local `val progressWriteIntervalTicks = max(1, seconds * 1000 / TICK_MILLIS).toInt()`. Keep `PROGRESS_WRITE_INTERVAL_TICKS` removed (or as a default constant only). Verify with a focused unit test that asserts the conversion math (e.g. seconds=10 + TICK_MILLIS=1000 → 10 ticks).
- [ ] Update `restoreState()`'s Route branch to use the same read path so a kill-restart honors the latest setting. Verify by inspection plus the existing service tests still passing.
- [ ] Add an Options section in `feature/options/OptionsScreen.kt` (e.g. "Mock playback") with a slider or stepper bound to `progressWriteIntervalSeconds` (range 1 – 60, step 1), default 5, and a short explanation that higher values reduce writes but widen rollback after a kill. Verify by `just check`, `just lint`, and an Android Studio preview build.
- [ ] Run `just check`, `just lint`, and `JAVA_HOME=… ./gradlew :app:testDebugUnitTest`; record commit hash + results in this plan.
- [ ] Manual smoke on a real device: change the setting to 10 s, start a PingPong route, SIGKILL via `run-as dev.narumi.kestrel kill -9 <pid>`, verify the new pid resumes with rollback ≤ 10 s × speed (versus ≤ 5 s × speed at the default). Record date + commit hash here.
- [ ] Update the `## GOTCHA` entry in `docs/MEMORY.md` from "5 s" to point at the new setting and note that the rollback budget is now configurable.

## Risks

- **Off-by-tick conversion.** `seconds * 1000 / TICK_MILLIS` must guard against `TICK_MILLIS` ever changing. The math test above covers this; keep `TICK_MILLIS` as the source of truth, not a hard-coded 1000.
- **User picks a very large value and forgets.** Worst case after an overnight kill the dot reappears tens of meters off. Documented in the Options helper text; not a correctness bug.
- **Slider UX precision.** A 1-second step over 1–60 might feel coarse near the low end. Acceptable for a tweak knob; revisit only if user feedback says otherwise.

## Completion Checklist

- [ ] `progressWriteIntervalSeconds` is persisted in DataStore with a default of `5` and a legacy-decode test proving older payloads still load, verified by `:app:testDebugUnitTest`.
- [ ] `LocationService` reads the setting at `ACTION_START_ROUTE` and inside `restoreState()`, with a unit test asserting the seconds → ticks conversion against `TICK_MILLIS`.
- [ ] Options screen exposes the setting with a 1 – 60 s range, default 5, and inline explanation, verified by `just check`, `just lint`, and a screenshot or Android Studio preview attached to the PR.
- [ ] Setting the value to 10 s on a real device makes the persisted `progressMeters` advance by ~10 s of motion between writes (vs. ~5 s at default), verified by polling `mock_state_json` via `adb shell run-as … cat … | strings | grep mock_state -A1` and recorded in this plan with date + commit hash.
- [ ] `docs/MEMORY.md` GOTCHA entry references the new setting instead of a hard-coded 5 s, verified by `git grep "PROGRESS_WRITE_INTERVAL_TICKS"` returning only the source default and the setting wiring (no stale doc references).
