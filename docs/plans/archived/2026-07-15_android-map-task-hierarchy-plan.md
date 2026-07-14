## Goal

Improve the Android Map screen’s task hierarchy so users see one setup prerequisite at a time, the primary mock action remains dominant, and route configuration appears only when a draft route can use it. Standardize the Android project’s local and CI build toolchain and bytecode targets on Java 26. Preserve all existing mock, route-generation, favorite, and navigation capabilities.

## Context

The Map screen is the app’s primary workspace. Its current surface can simultaneously show permission and developer-option actions, route controls that do not apply to an empty or single-point draft, and three icon-only floating actions. The app already uses Material3 and a bottom-sheet workflow, so this change should refine that structure rather than redesign it.

## Non-Goals

- Do not change `LocationService`, route playback, persistence, or MapLibre behavior.
- Do not remove random-route generation, Go to, favorites, or current-location centering.
- Do not clear app data, install an APK, or run connected instrumentation tests.

## Plan

- [x] Migrate the Gradle daemon, Android Java/Kotlin compile targets, Detekt target, CI/release workflows, and development prerequisites to Java 26; Gradle reported Java 26, compiled classes report major version 70, old pins are absent, and all Android quality gates pass.
- [x] Add pure Map presentation rules for ordered setup prerequisites and contextual route-settings visibility; red compilation failed on missing rules, then `MapPresentationRulesTest` passed with Java 26 via the targeted `:app:testDebugUnitTest --tests …` command.
- [x] Update `MapScreen.kt` and `MapPolishComponents.kt` to present one setup action at a time, disclose route settings only for an editable multi-waypoint draft, and replace competing floating actions with a labeled `Go to` action plus conventional current-location control; `just android-check` passed and source review covered all idle/running/setup branches.
- [x] Run Android formatting, unit tests, build, and detekt; `spotlessApply`, `just android-check`, `just android-test`, `just android-build`, and `just android-lint` all passed on Java 26.

## Risks

- Hiding route settings too aggressively could obscure active playback configuration; keep speed/mode in the active route status and show the settings summary/control before route start.
- Removing the random-route FAB could bury replacement generation; retain `Generate random route` as the empty-state primary action and `Replace with random route` beside draft actions.
- Large text or narrow screens could squeeze floating actions; use Material3 controls with text wrapping avoided and retain semantic labels.

## Completion Checklist

- [x] Android builds consistently use Java 26 locally and in CI/release workflows: Gradle launcher/daemon reported 26.0.1, Kotlin class files report major version 70, CI/release use Temurin 26, and repository search found no stale Java 11/21 pins.
- [x] Setup guidance exposes only the next unmet prerequisite: all four `MapPresentationRulesTest` tests passed and `StatusBanner` renders only the action for its current `MapSetupStep`.
- [x] Empty, single-point, multi-point, single-mock, route-playing, and route-paused states retain a clear primary action and necessary status, verified by the passing map presentation/reconciliation tests and every `PrimaryActionRow` / `StatusRow` branch.
- [x] Random-route generation, Go to, center-on-me, clear, save-route, speed, and mode remain reachable with no more than one disclosure step; source entry-point audit confirmed each callback/control.
- [x] Android quality gates pass on Java 26: `just android-check`, `just android-test`, `just android-build`, and `just android-lint` all completed successfully; debug APK produced at `app/build/outputs/apk/debug/app-debug.apk`.
