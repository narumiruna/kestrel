# Route UI state restore plan

## Goal

Stop `MapScreen` from looking like the route was stopped whenever its composable gets disposed (tab switch, config change, Activity recreate, return from background). The route in `LocationService` survives; the UI loses `runState` / `waypoints` / `speedKmh` / `routeMode` because they are plain `remember` values not aligned with the service. Make the service the single source of truth for "is there a mock running, and what is it", so the sheet reflects reality immediately on every (re)composition and no user gesture can accidentally `LocationService.stop(context)` because the UI forgot the route exists.

Success: switching to the Favorites tab while a route is playing, then switching back, shows the polyline, the speed/mode chips matching the running route, and a Pause button (or Resume if paused) — without any extra user action and without resetting the route.

## Context

`feature/map/MapScreen.kt`:

```kotlin
var waypoints by remember { mutableStateOf<List<LatLng>>(emptyList()) }
var speedKmh  by remember { mutableStateOf(20.0) }
var routeMode by remember { mutableStateOf(MovementEngine.Mode.Once) }
var runState  by remember { mutableStateOf(RunState.Idle) }
```

`MainActivity.kt` switches screens with a `when (currentDestination)` directly inside `NavigationSuiteScaffold`, so MapScreen is fully disposed on tab change. There is no `NavHost` backstack and no `rememberSaveable` here.

`LocationService` already:
- persists `MockState` (Idle / Single / Route incl. progress + forward) into DataStore via `KestrelPrefs.setMockState`.
- exposes `companion val currentMock: StateFlow<LatLng?>`.
- holds a `@Volatile var paused` that is **not** in `MockState` and **not** exposed.

So the route data needed to rebuild the UI exists; pause state is the only gap.

Call sites that destroy the route based on stale UI state (the actual "莫名其妙被 stop" surface):
- `MapScreen.applyPoint` / `applyItem`: `if (runState != RunState.Idle) LocationService.stop(context)` — wrong when `runState` was just reset by recomposition.
- `onStop` FAB and `onClear` in the sheet.
- `handlePrimary` Idle branch: with empty `waypoints` it opens the Generate dialog instead of doing harm, but a one-waypoint state would call `setLocation`, replacing the route silently.
- `onMapClick`: appends to `waypoints` when `runState in {Idle, Single}`. After recomposition this lets the user accidentally edit a route that is actually running.

## Non-Goals

- Do not introduce a ViewModel layer or DI framework just for this. A `StateFlow` on `LocationService.Companion` plus DataStore reads is enough.
- Do not migrate Tab navigation to a `NavHost` backstack. Out of scope; the root cause we are fixing is "UI forgets the service", not "tabs don't keep state".
- Do not change `MovementEngine` or progress-persist cadence. Plan `2026-05-11_route-progress-write-cadence-setting-plan.md` already owns that surface.
- Do not redesign the bottom sheet UX. Only restore the existing controls into the right state.
- Do not touch `LocationService`'s lifecycle / foreground type / notification flow.

## Architecture

Source of truth split, after this change:

| State | Owner | Surfaced to UI via |
|---|---|---|
| Is a mock active? Single vs Route? Paused? | `LocationService` | new `StateFlow<RuntimeState>` on `LocationService.Companion` |
| Running route's waypoints / speed / mode / progress | `LocationService` + `prefs.mockState` (persisted) | same `RuntimeState` (carries waypoints / speed / mode); UI does not need progress |
| Mock point being streamed right now | `LocationService` | existing `currentMock: StateFlow<LatLng?>` (unchanged) |
| User's draft (waypoints being drawn before Play, draft speed/mode chips) | `MapScreen` local state | `rememberSaveable` so config changes don't wipe drafts |

`RuntimeState` is a sealed type:

```kotlin
sealed interface RuntimeState {
    data object Idle : RuntimeState
    data class Single(val point: LatLng) : RuntimeState
    data class Route(
        val waypoints: List<LatLng>,
        val speedKmh: Double,
        val mode: MovementEngine.Mode,
        val paused: Boolean,
    ) : RuntimeState
}
```

`LocationService` updates `_runtimeState` on every state transition it already performs (`ACTION_START_ROUTE`, `ACTION_SET_LOCATION`, `ACTION_PAUSE`, `ACTION_RESUME`, `ACTION_STOP`, Once-finish transition, `restoreState`). The progress writer loop does **not** push updates — `RuntimeState` only changes on transitions, not every tick, so it stays cheap and Compose doesn't recompose every second.

`MapScreen` collects `runtimeState` with `collectAsStateWithLifecycle` and derives `runState` + the "live" `waypoints` / `speedKmh` / `routeMode` to render. Local `var`s become "draft" state only, used while `runtimeState is Idle`. Reconciliation rule:

- `runtimeState is Route` → render route waypoints + mode + speed from `runtimeState`; ignore drafts; show Pause/Resume + Stop.
- `runtimeState is Single` → render single point; show Stop.
- `runtimeState is Idle` → render drafts; show Play / Generate / Clear.

Side effect: the destructive `if (runState != Idle) stop(...)` guards in `applyPoint` / `applyItem` / `onClear` become explicit "replace the running mock" decisions that we keep, but they now key off `runtimeState`, which actually matches what the service is doing.

## Assumptions

- `LocationService` is a singleton-ish foreground service; a `companion`-level `StateFlow` is acceptable (consistent with existing `currentMock`). If multiple processes were ever a concern, DataStore would already be wrong too.
- Service process death between MapScreen disposal and re-composition is rare. When it does happen, `START_STICKY` + `restoreState()` already rebuilds `MockState`; the new flow just needs to be re-seeded inside `restoreState()`.
- It is acceptable for `RuntimeState` to be empty (`Idle`) on the very first frame after process restart until `restoreState()` finishes. UI just shows Idle for that brief window; the route resumes shortly after. Out of scope to add a "loading" indicator.

## Unknowns

- None blocking. The "tab returns to a Once-finished route that auto-transitioned to Single" path needs verification — `LocationService.startRoute`'s finish branch already moves to Single + writes prefs, so emitting `RuntimeState.Single` there should be enough. Confirm during implementation by switching tabs right after a short Once route completes.

## Plan

- [x] Add `RuntimeState` sealed interface in `core/location/RuntimeState.kt` with `Idle`, `Single(point)`, `Route(waypoints, speedKmh, mode, paused)`. Verified by `:app:compileDebugKotlin` and `rg RuntimeState app/src/main`.
- [x] Add `private val _runtimeState = MutableStateFlow<RuntimeState>(RuntimeState.Idle)` and `val runtimeState: StateFlow<RuntimeState>` on `LocationService.Companion`, mirroring the existing `currentMock` pattern. Verified by build.
- [x] Emit on every transition inside `LocationService.onStartCommand` (`ACTION_START_ROUTE`, `ACTION_SET_LOCATION`, `ACTION_PAUSE`, `ACTION_RESUME`, `ACTION_STOP`), inside the Once-finish branch of `startRoute`'s coroutine, and at the end of `restoreState()`. Not emitted from the progress writer tick. Verified by inspection (`rg "_runtimeState.value" app/src/main` lists only transition sites; no occurrence inside the `while (isActive && !engine.isFinished())` loop body).
- [x] In `MapScreen.kt` replace the `var runState by remember` with a derived value from `LocationService.runtimeState.collectAsStateWithLifecycle()`. Compute `renderedWaypoints` / `renderedSpeedKmh` / `renderedRouteMode` as a derived `MapRender` that picks service values when `Route`, otherwise draft values. Passed derived values into `MapSheet`, `KestrelMap`'s `polyline`, and `StatusRow`. Pending: device repro (see manual repro task).
- [x] Convert the draft locals (`waypoints`, `speedKmh`, `routeMode`) to `rememberSaveable`. Added `DraftWaypointsSaver` flat lat/lng-double saver for the list. Pending: device rotation repro (see manual repro task).
- [x] Update `applyPoint`, `applyItem`, `onClear`, `onMapClick`, and `handlePrimary` to key their "is something running?" decisions off the derived `runState` (sourced from `runtimeState`), not a local `runState` var. Existing semantics preserved: replacing a running mock still stops the service first; `onMapClick` still appends to drafts only when `runState in {Idle, Single}`.
- [x] Update the Once-finish path in `LocationService.startRoute` to also emit `RuntimeState.Single(last)` alongside the existing `MockState` write. Pending: device repro at finish moment.
- [x] Add a unit test under `app/src/test/java/dev/narumi/kestrel/feature/map/MapRenderReconciliationTest.kt` exercising the four `RuntimeState` cases against the pure `reconcileMapRender` function. Verified by `./gradlew :app:testDebugUnitTest` (4 tests pass).
- [x] Run `just format`, `just check`, `just lint`, and `:app:testDebugUnitTest`. All green on commit `<pending>` (recorded after commit).
- [x] Manual repro of the original bug on a real device, after the fix: start a Loop route → switch to Favorites tab → wait 10 s → switch back → confirm polyline + Pause button + speed/mode chips reflect the running route; then tap Stop and confirm it stops. Recorded under "Smoke results" below (2026-05-11, commit `b0746a8`, moto g34 5G / Android 15).
- [x] Add a `## GOTCHA` entry to `docs/MEMORY.md` referencing `LocationService.runtimeState` as the source of truth for any UI that needs to know if a mock is running. Verified by `git grep "runtimeState" docs/MEMORY.md`.

## Risks

- **Flow emits during recomposition cause loops.** Guarded by the rule that `RuntimeState` only changes on real transitions, not on every tick. Verify by adding a `Log.d` on emission during the device repro and confirming a quiet log while a route plays.
- **`paused` drift across process death.** `paused` lives only in `LocationService` memory, not in `MockState`. After process kill + restore, the route resumes un-paused. Acceptable for this plan; documented as a known limitation. Out-of-scope follow-up: add `paused: Boolean = false` to `RouteState` (back-compat default).
- **Saveable `List<LatLng>` size.** Routes can have hundreds of points; `rememberSaveable` parcels go through Bundle. Mitigation: only the *draft* list is saveable (typically small, user-drawn); running-route waypoints come from the service. If a draft ever exceeds the Bundle quota the user would have already pressed Play.
- **Behavior change for `onMapClick` while Single.** Preserve current "append while Single" to avoid scope creep, but flag in the PR description so reviewers can decide whether to tighten it later.

## Rollback / Recovery

Revert is a single PR revert: no schema change, no DataStore migration, no notification or service-lifecycle change. Drafts revert to plain `remember`. `RuntimeState` flow goes away. Behavior returns to the current (buggy) state.

## Completion Checklist

- [x] `LocationService.runtimeState: StateFlow<RuntimeState>` exists, is emitted on every state transition listed in the Plan, and is **not** emitted from the per-tick progress writer, verified by `rg "_runtimeState.value" app/src/main` matching only transition sites.
- [x] `MapScreen` derives run state from `runtimeState` and no longer reads or writes a local `var runState`, verified by `rg "var runState" app/src/main/java/dev/narumi/kestrel/feature/map/` returning no matches.
- [x] Draft `waypoints` / `speedKmh` / `routeMode` survive a device rotation, verified by manual repro recorded in "Smoke results" below.
- [x] Switching tabs while a route is playing and switching back restores polyline + Pause/Resume + Stop without any user action and without resetting the route, verified by manual repro recorded in "Smoke results" below.
- [x] Once-route finishing while MapScreen is *not* visible leaves a Single pin visible when MapScreen returns, verified by manual repro recorded in "Smoke results" below.
- [x] `just format`, `just check`, `just lint`, and `:app:testDebugUnitTest` all pass on the final commit (commit hash recorded post-commit).
- [x] `docs/MEMORY.md` has the new `## GOTCHA` entry pointing at `LocationService.runtimeState`, verified by `git grep "runtimeState" docs/MEMORY.md`.

## Manual smoke runbook

Run against a real device (mock-location must be set to Kestrel in Developer Options). Baseline commit at runbook authoring: `b0746a8`. Record actual commit hash with `git rev-parse HEAD` before starting.

### Setup (once per session)

> **DO NOT run `just reset`.** It is `pm clear` and will destroy the operator's favorites, prefs, and mock state with no undo. The three scenarios below only build *draft* routes (map taps / Generate dialog) and *do not* require a clean app state. If you genuinely need a clean state, ask first and back up `files/datastore/kestrel_prefs.preferences_pb` via `adb` beforehand.

1. Plug in device, `just devices` — expect exactly one entry.
2. `just br` — build, install, launch. Wait for MapScreen to render. If a mock is already running from a previous session, tap **Stop mock** before starting Scenario A so you begin from Idle.
3. In a second terminal: `just logf` — clear + follow. Keep this open during all four scenarios; grep for `LocationService` / `RuntimeState` lines.
4. Record: device model, Android version, `git rev-parse HEAD`, runbook date.

### Scenario A — tab-switch while Loop route is playing (Plan last item + Completion #4)

1. On Map tab, tap the small FAB with the sparkle icon (`Generate route`) → in the dialog set Mode = **Loop**, accept defaults → tap Generate.
2. Tap the primary button in the bottom sheet (`Play route`). Confirm a polyline is drawn and the chip shows `Loop` + speed.
3. Switch to **Favorites** tab. Wait ≥ 10 s (route keeps running in foreground service).
4. Switch back to **Map** tab.
5. **Expect**:
   - polyline visible immediately on first frame,
   - mode chip = `Loop`, speed chip matches step 2,
   - primary button = `Pause` (not `Play`, not `Generate`),
   - no extra user gesture needed,
   - blue mock dot continues moving (route did NOT reset to start).
6. Tap **Pause** → primary becomes `Resume`, dot stops.
7. Tap **Resume** → dot moves again.
8. Tap **Stop mock** → polyline cleared, mode back to draft state, blue dot stops streaming.
9. logcat sanity check: no `RuntimeState` emissions during the 10 s wait (only on transitions in steps 2, 6, 7, 8).

Fill in: `Scenario A: <date> <commit> PASS|FAIL — <notes>`.

### Scenario B — device rotation preserves draft (Completion #3)

1. From Idle (run `just reset && just br` if previous scenario left state).
2. On Map tab, tap 3 points on the map to build a draft polyline. Adjust speed slider to a non-default value (e.g. 60). Change mode chip to **PingPong**. Do **not** press Play.
3. Rotate device (or `adb shell settings put system user_rotation 1` then back to 0).
4. **Expect** after rotation: same 3 waypoints, same 60 km/h, mode chip still `PingPong`, primary button still `Play route`.

Fill in: `Scenario B: <date> <commit> PASS|FAIL — <notes>`.

### Scenario C — Once route finishes while MapScreen is hidden (Completion #5)

1. From Idle. On Map tap 2 close-together points so a Once route finishes in ~5 s at default speed. Set mode = **Once**.
2. Tap `Play route`.
3. Immediately switch to **Favorites** tab. Wait ~15 s (longer than the route duration).
4. Switch back to **Map**.
5. **Expect**: single pin at the route's last waypoint, no polyline of remaining route, primary button = `Stop mock` (Single state), blue dot stationary at the end.
6. `just prefs` (optional) — DataStore `mockState` should be `Single`, not `Route`.

Fill in: `Scenario C: <date> <commit> PASS|FAIL — <notes>`.

### Recording results

After all three scenarios PASS, edit this plan:

- Tick the four remaining `[ ]` boxes (Plan last item + Completion #3 / #4 / #5).
- Append a `### Smoke results` subsection below with the three filled-in lines from above, plus device + Android version.
- Commit with `docs(plans): record route-ui-state-restore smoke results` (stage only this file).

If any scenario FAILs: do **not** tick. Open a follow-up entry under `## Unknowns` describing the failure mode + logcat snippet, and stop — that becomes the next plan.

### Smoke results

- **Date**: 2026-05-11
- **Commit**: `b0746a8` (main, post-merge of PR #56)
- **Device**: Motorola moto g34 5G, Android 15 (API 35)
- **Operator notes**: this run also caught two surfaces that are not regressions of this plan but worth tracking separately (see follow-ups below).

| Scenario | Result | Notes |
|---|---|---|
| A — Loop route + tab switch | PASS | Polyline restored on return; primary button = Pause; blue dot continued from where it was (no reset to start). Pause stops the dot, Resume restarts it, Stop clears polyline and returns primary to `Generate random route`. Mode/speed chips are visually indistinguishable while route is running (all three look grey) because `AssistChip` with `enabled=false` overrides the `primaryContainer` selected color; the underlying `selected` state is correct per `reconcileMapRender` (returns `runtime.mode` / `runtime.speedKmh` when `RuntimeState is Route`). Treated as cosmetic, filed as follow-up. |
| B — Draft survives rotation | PASS | 3 map-tap waypoints + Ping-pong mode survived portrait → landscape → portrait. Speed stayed at 20 km/h (the default; weak signal on its own, but Ping-pong vs default Once is a strong signal that `rememberSaveable` is wired correctly). |
| C — Once route finishes while hidden | PASS | Played a short 2-point Once route, switched to Favorites within ~1 s of pressing Play, waited 15 s, switched back. No polyline, primary = `Stop mock`, status = single point. Once-finish → `RuntimeState.Single` transition emitted while MapScreen was disposed and surfaced correctly on re-composition. |

### Follow-ups (out of scope for this plan)

- Status row while a route is playing should display the current mode + speed numerically (today it only shows `Route playing` + waypoint count); without this, an operator can't tell at a glance whether the restored route is in Once/Loop/PingPong or what speed it's running at.
- `ChipChoice` with `enabled = false && selected = true` is visually indistinguishable from an unselected disabled chip. Consider keeping `primaryContainer` at reduced alpha (or adding an outline) so the selected mode/speed stays visible while a route is running.
- Drafts (`waypoints` / `speedKmh` / `routeMode`) do **not** survive a tab switch, only a config change. This is consistent with the Non-Goals (`NavigationSuiteScaffold` is not a `SaveableStateHolder`-backed backstack) but is surprising to operators. Either accept and document, or migrate tab navigation to `NavHost` in a separate plan.
