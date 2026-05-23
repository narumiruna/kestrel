# Route status mode and speed plan

## Goal

Show the active route's playback mode and speed in the Map bottom-sheet status row so operators can confirm restored/running routes at a glance. The change is complete when the running and paused route status text includes waypoint count, km/h, and mode from `LocationService.runtimeState`.

## Context

`MapScreen` already reconciles `RuntimeState.Route` into service-owned `speedKmh` and `routeMode`, but `StatusRow` only displays `Route playing` / `Route paused` plus waypoint count. The engineering backlog tracks this as a map UI polish item.

## Non-Goals

- Do not change route playback behavior or `LocationService` persistence.
- Do not redesign the speed/mode chips; disabled selected-chip styling is a separate backlog item.

## Plan

- [x] Update `MapSheet` and `StatusRow` in `app/src/main/java/dev/narumi/kestrel/feature/map/MapScreen.kt` to pass the rendered route speed/mode into the status row and display running/paused route details as waypoint count, formatted speed, and mode label; verified by code inspection and focused unit test coverage.
- [x] Add or update a pure unit test under `app/src/test/java/dev/narumi/kestrel/feature/map/` that locks the route status subtitle formatting for integer and fractional speeds; verified with `JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home" ./gradlew :app:testDebugUnitTest --tests 'dev.narumi.kestrel.feature.map.MapRenderReconciliationTest'`.
- [x] Run project quality checks for the touched Android code; verified with `just check` and `just lint`.
- [x] Mark the engineering backlog item complete with evidence pointing to this archived plan and the verification commands; updated `docs/plans/2026-05-10_engineering-backlog-plan.md`.

## Risks

- Overlong status text could wrap on narrow screens; keep the copy compact and avoid adding another visible control.

## Completion Checklist

- [x] Active route status shows `waypoints · km/h · mode` for both playing and paused states, verified by `MapScreen.kt` implementation and `MapRenderReconciliationTest` coverage for integer/fractional speed formatting.
- [x] Android verification passes with the focused unit test, `just check`, and `just lint`.
- [x] The engineering backlog item for current mode + speed status is checked with completion evidence in `docs/plans/2026-05-10_engineering-backlog-plan.md`.
