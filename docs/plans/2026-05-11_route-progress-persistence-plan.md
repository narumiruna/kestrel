# Route progress persistence plan

## Goal

When `LocationService` is killed by the system (low memory, aggressive OEM background-kill, overnight idle) and restarted via `START_STICKY`, an in-progress mock route resumes near where it stopped instead of restarting from the first waypoint. Loop and PingPong are the primary modes to keep working; Once mid-route is a bonus.

## Context

`LocationService` already persists enough state to restart in the right mode:

```kotlin
// app/src/main/java/dev/narumi/kestrel/core/data/Preferences.kt
data class RouteState(
    val lats: DoubleArray,
    val lngs: DoubleArray,
    val speedKmh: Double,
    val mode: String = "Once",
)
```

On `onStartCommand(null, …)` the service calls `restoreState()`, which builds a fresh `MovementEngine(waypoints, speedKmh / 3.6, mode)` from that `RouteState`. `MovementEngine` has no constructor seed for `progress` or PingPong's `forward`, so progress always starts at `0.0`. Loop and PingPong therefore appear to "reset to origin" after the process is killed.

Foreground services protect against most memory pressure, but real devices (especially Xiaomi / Huawei / Samsung battery savers) still kill them under long-idle conditions — exactly the overnight case the user reported.

`MockState` for Single mode already round-trips correctly, and Once-completed routes already transition to Single, so this plan only changes the Route branch.

## Architecture

- `RouteState` gains two optional fields with safe defaults:
  - `progressMeters: Double = 0.0`
  - `forward: Boolean = true`
  Defaults keep old persisted JSON compatible (the DataStore decoder already uses `ignoreUnknownKeys = true`; new optional fields with defaults make missing values resolve to "start of route").
- `MovementEngine` gains two constructor params:
  - `initialProgressMeters: Double = 0.0`
  - `initialForward: Boolean = true`
  Clamp `initialProgressMeters` into `[0, totalDistance]` to avoid corrupt state. `initialForward` only matters for PingPong.
- `LocationService.startRoute` (and the route loop) writes progress back into DataStore on these triggers:
  - on `ACTION_START_ROUTE` (initial 0 + waypoints, today's behavior)
  - every N ticks while the loop runs (proposed N = 5, so a write every 5 s at the current 1 s tick)
  - on `ACTION_PAUSE` and `ACTION_RESUME`
  - on Once-mode completion just before the Single transition (so progress doesn't out-live the route)
  - on `ACTION_STOP` and `onDestroy` (best-effort; `onDestroy` is not guaranteed under kill, hence the periodic writes)
- `restoreState()` Route branch passes the persisted `progressMeters` / `forward` into the new `MovementEngine`.

## Non-Goals

- Do not solve OEM aggressive-kill at the platform level (no battery-saver onboarding, no `ignoreBatteryOptimizations` UX flow). That is a separate, larger UX topic.
- Do not change the tick rate or the route loop scheduling model.
- Do not change the visible notification actions (Pause / Resume / Stop stay as-is).
- Do not persist `MockProviderManager` state; restart of the mock provider already happens via `ensureMockStarted()` in `restoreState()`.
- Do not back-fill progress for Once routes that already finished and were converted to Single; that path already works.

## Assumptions

- DataStore async writes from the route loop are cheap enough at 5 s intervals to ignore (existing single-point keep-alive also writes once per `setMockState` call). If profiling later shows otherwise, the write cadence is the only knob to turn.
- Up to one write cadence (≤ 5 s × speed, e.g. ≤ 75 m at 54 km/h) of "jump back" after a kill is acceptable. The user's primary observation is "回到原點"; a 75 m setback is invisible by comparison.
- `MovementEngine.progressMeters()` returns a value within `[0, totalDistance]` after `Loop` wrap-around and `PingPong` reflection, so writing it straight back to DataStore is safe.

## Unknowns

- Whether DataStore in this project uses `updateData` with merging, or unconditional rewrite of the whole `Preferences` blob, matters for write cost at 5 s cadence. Resolved by reading `KestrelPrefs.setMockState` before implementation.

## Plan

- [x] Read `KestrelPrefs.setMockState` and confirm whether DataStore writes the full blob each call; if so, decide whether to keep N = 5 s or stretch to N = 10 s. **Decision (2026-05-11): keep N = 5 s.** `setMockState` calls `store.edit { it[Keys.MOCK_STATE] = json.encodeToString(...) }`, which rewrites only the one key (Preferences DataStore is key-scoped). The serialized `MockState` is on the order of a few hundred bytes; writing it every 5 s is well within DataStore's coalescing budget.
- [x] Extend `RouteState` in `app/src/main/java/dev/narumi/kestrel/core/data/Preferences.kt` with `progressMeters: Double = 0.0` and `forward: Boolean = true`; verified by `RouteStateSerializationTest.decodesLegacyJsonWithoutProgressOrForward` (legacy JSON without the new fields decodes to defaults) and `roundTripsNewFields`.
- [x] Extend `MovementEngine` constructor with `initialProgressMeters: Double = 0.0` and `initialForward: Boolean = true`; clamp `initialProgressMeters` into `[0, totalDistance]`; verified by new `MovementEngineTest` cases for Once / Loop / PingPong seeded mid-route plus `initialProgressIsClampedIntoRange`.
- [x] Update `LocationService.startRoute` to take an initial progress/forward pair and seed the engine; update `restoreState()` Route branch to read them from `RouteState`; verified by inspection + the existing unit tests still passing.
- [x] Add a periodic progress writer inside the route loop: every `PROGRESS_WRITE_INTERVAL_TICKS` ticks, write current `progressMeters` and `forward` back into `MockState.route` without changing other fields; implemented as the `tickCounter`-driven branch inside `startRoute`'s loop. Smoke verification still pending (runbook step 3).
- [x] Persist progress on `ACTION_PAUSE`, `ACTION_RESUME`, route-finish-into-Single, `ACTION_STOP`, and `onDestroy`; implemented (`onDestroy` uses `runBlocking` since it runs after a stop intent and before scope cancellation; route-finish path goes through the existing Single-transition write). Smoke verification still pending (runbook step 3).
- [x] Add JVM unit tests covering the schema-default round trip and the engine seed behavior; verified by `JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home" ./gradlew :app:testDebugUnitTest --rerun-tasks` (10 suites / 50 tests / 0 failures, +6 vs. main).
- [x] Run `just check`, `just lint`, and the Android unit tests; all pass on the implementing branch. `just lint-baseline` was regenerated to absorb the `LocationService` `TooManyFunctions` (20) and `onStartCommand` `CyclomaticComplexMethod` (20) threshold collisions; same regen also dropped two stale `MapScreen` entries that had already been refactored away.
- [ ] Manual smoke on a real device using the Validation runbook below; record date + commit hash here.
- [x] Add a `## GOTCHA` entry to `docs/MEMORY.md` noting that route progress is now persisted every 5 s and may roll back by that much after a kill.

## Risks

- **Stale progress after waypoint edit.** If the route waypoints change but the persisted `progressMeters` is preserved by accident, the engine could resume into an inconsistent segment. Mitigation: `ACTION_START_ROUTE` always overwrites `MockState.route` with `progressMeters = 0.0`, and `restoreState()` clamps the seed.
- **PingPong direction flip near boundary.** If a write happens exactly at the reflection point, the persisted `forward` might lag one tick behind `progress`. Mitigation: write `forward` and `progress` together in the same `setMockState` call so they cannot disagree across a restart.
- **DataStore write storm under unusual TICK_MILLIS values.** Current TICK_MILLIS = 1000 ms makes a 5 s cadence trivially safe; if TICK_MILLIS is later lowered, the cadence must move to time-based rather than tick-based.
- **Pause-then-kill resume regression.** Today's pause leaves the loop alive but `paused = true`. Writing progress on pause/resume is required; otherwise a kill during pause would still reset progress.
- **OEM aggressive kill remains.** Even with persisted progress, the user-visible "jump back to ~5 s ago" is still visible. Out-of-scope for this plan; documented as a known limitation.

## Validation runbook

Run on the macOS dev machine with one real Android device + mock-location pointing to this app.

1. Unit tests
   - `just check`
   - `just lint`
   - `JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home" ./gradlew :app:testDebugUnitTest --rerun-tasks`
2. Live route persistence (no kill)
   - Launch app, start a PingPong route between two distinct waypoints at a slow speed (e.g. 5 km/h) so progress is visible.
   - After ≥ 10 s, dump prefs via `just prefs` and confirm `progressMeters > 0` and `forward` is present.
3. Simulated kill (process death without service stop)
   - With the route still running, run:
     ```bash
     ~/Library/Android/sdk/platform-tools/adb shell am crash dev.narumi.kestrel
     ```
     (or `am kill` for a softer kill). The system should restart `LocationService` via `START_STICKY`.
   - Wait a few seconds and verify on the map that the dot **resumes near** the pre-kill position (within ≤ 5 s × speed), not back at the first waypoint. For PingPong, also verify direction is preserved (point continues in the same direction it was heading).
4. Overnight smoke (optional but recommended once)
   - Start a Loop or PingPong route on the device, leave the app backgrounded with screen off overnight (or at least 4 h on an OEM with aggressive kill).
   - In the morning, verify the dot is not parked at the first waypoint. Acceptable: continuing near where it would be given elapsed time, or being on a sensible point along the route.
5. Record date, commit hash, and observed jump-back distance back in this plan under the matching Plan checkbox.

## Rollback / Recovery

- The new fields are optional with defaults; reverting the code without reverting persisted JSON is safe because the old decoder will simply ignore the extra keys (the project uses `ignoreUnknownKeys = true`).
- If the periodic write turns out to be too expensive at runtime, the cadence constant is the only thing to change; the rest of the design stays.

## Completion Checklist

- [ ] `RouteState` carries `progressMeters` and `forward` with backward-compatible defaults, verified by a unit test that decodes a legacy JSON blob.
- [ ] `MovementEngine` can be seeded mid-route for Once / Loop / PingPong, verified by `MovementEngineTest` cases that assert the first sample after seeding lies past the origin and PingPong direction is honored.
- [ ] `LocationService` writes progress and forward at least every 5 s, plus on pause/resume/stop/finish, verified by `just prefs` after ≥ 10 s of route playback.
- [ ] After `adb shell am crash dev.narumi.kestrel` mid-route, the restarted service resumes within ≤ 5 s × speed of the pre-kill position, verified by a one-device smoke test recorded in this plan with date + commit hash.
- [ ] `just check`, `just lint`, and `:app:testDebugUnitTest` pass on the implementing commit, recorded with commit hash.
- [ ] `docs/MEMORY.md` has a one-line `## GOTCHA` entry pointing future debuggers at the periodic progress write and the ≤ 5 s rollback window.
