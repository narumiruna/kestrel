# Android Favorites and preview polish

## Goal

Make saved locations easier to find and point previews easier to save without changing playback, storage, cloud, or navigation contracts. This is a focused follow-up to the implemented workflow redesign; its outstanding acceptance and device-test work remains in the existing redesign plan.

## Status

Implementation is ready for a PR checkpoint, not final UI acceptance. Keep this plan active and committed at the user's request so development can continue on another computer. Emulator execution and screenshot comparison remain unchecked; do not archive or delete the plan.

## Plan

- [x] Extract stateless Favorites content into `FavoritesContent.kt`, use one scrolling list for headers, controls and rows with dismissible Snackbar feedback that stays visible while scrolling, add name search, Material 3 selected filters, a labeled sort menu, result counts and a clear-filter empty state. Verify search/filter/order behavior with JVM tests and controls with Compose test sources.
- [x] Replace the route-only draft actions with point/route preview saving through the existing save dialog. Keep Save and Undo direct, disclose Clear and random replacement in a labeled overflow menu, and correct singular point status copy. Verify callbacks and pending-state semantics with Compose test sources.
- [x] Add host preview cases for narrow, large-text and short-screen Favorites plus point/route draft controls; render and review images outside the repository. Update `docs/android-app-guide.md` to match the controls.

## Completion Checklist

- [x] Favorites search is case-insensitive, trims whitespace, composes with type filters, preserves stable IDs and existing sort/reorder behavior, and has an explicit reset path.
- [x] Point and route previews use the existing persistence/error flow; no service, schema, preference or cloud changes are needed.
- [x] `just android-check`, `just android-lint`, `just android-test`, `just android-build` and `:app:assembleDebugAndroidTest` pass using Java 26 and the local Android SDK.
- [x] Host render results are reviewed; screenshot validation is attempted and any unavailable baseline is reported rather than manufactured. No connected instrumentation, device changes, image binaries or unrelated files are included.
- [ ] Screenshot comparison passes against approved reference images. Blocked: this worktree has no reference images; all 16 cases report `ScreenshotImageNotFoundException`. Do not manufacture passing baselines from the new renders.

## Emulator follow-up

- [ ] Launch a new isolated Android Emulator, install the debug app and interaction APK, verify the changed flows and save actual emulator screenshots outside the repository.
- User requested emulator verification. Do not operate a physical device or wipe an existing AVD.
- Emulator installation has not started. The original disk-space blocker cleared after free space rose from about 5 GiB to 14 GiB (about 13 GiB at PR preparation). The user then requested a PR handoff to another computer, so verification remains pending there rather than blocked by disk space on this machine.
- Provision an Emulator and an AOSP system image matching the new computer's CPU architecture. The inspected macOS ARM64 Emulator and API 35 image require about 2.8 GiB extracted, plus download staging and writable AVD storage; check the destination's free space before installing.

## Validation boundaries

- Android SDK: `/opt/homebrew/share/android-commandlinetools`; Java 26 is available through the Justfile default.
- Connected execution is authorized only on a new isolated emulator for this follow-up. Physical-device installation or instrumentation remains unauthorized.
- Screenshot baselines are not tracked by repository policy. Do not update references merely to make validation pass.

## Evidence (2026-09-12)

- Passed `just android-check`, `just android-lint`, `just android-test` (151 tests, zero failures/errors/skips), `just android-build`, and `:app:assembleDebugAndroidTest`. All commands used `ANDROID_HOME=/opt/homebrew/share/android-commandlinetools`; direct Gradle commands also set `JAVA_HOME` to the Justfile's Java 26 path.
- Added seven JVM search tests and seven Compose interaction tests. The interaction APK compiles; connected execution was not performed.
- Ran `:app:validateDebugScreenshotTest --init-script /tmp/kestrel-android-ux.4weO6x/screenshots.init.gradle` to route all preview/diff images and the HTML report outside the repository. All 16 previews rendered; comparisons could not run because reference images are absent. No references were generated or updated.
- Reviewed Favorites at 320dp, 600dp short landscape and 360dp with 2x text, plus point saving and route-draft controls. Changed the count/sort row to wrap naturally after large-text review. Feedback uses a dismissible Snackbar so list scrolling cannot hide action results.
- Images and report: `/tmp/kestrel-android-ux.4weO6x/` on the original computer only. These temporary artifacts are not transferred by Git and must be regenerated on the new computer. `git diff --check` passed; no binary files are included. The earlier redesign plan remains unchanged.

## Continue on another computer

1. Fetch this PR's branch, `narumi/feat/android-favorites-preview-ux`. With GitHub CLI:

   ```bash
   gh repo clone narumiruna/kestrel
   cd kestrel
   gh pr checkout narumi/feat/android-favorites-preview-ux
   ```

2. Set `JAVA_HOME` to Java 26 and `ANDROID_HOME` to the new computer's SDK. Install the required SDK platform/build tools from `app/build.gradle.kts`, and run the gates separately:

   ```bash
   just android-check
   just android-lint
   just android-test
   just android-build
   ./gradlew :app:assembleDebugAndroidTest
   ```

3. Create a disposable AVD and identify its serial with `adb devices -l`. Target that emulator explicitly for every install, instrumentation, input and screenshot command. Install the debug app and interaction APK from `app/build/outputs/apk/`; run only `FavoritesPreviewInteractionTest` and `WorkflowInteractionTest` with `AndroidJUnitRunner`. Do not run cloud/device smoke tests, connect a real account, or target a physical device.
4. Verify the real App: save a point preview and a route preview, search/filter/sort Favorites, clear an empty search, and reach row actions at short height and 2x text. Confirm preview saving does not start playback. Record emulator/API details and test results here; keep screenshots outside the repository.
5. For host preview regeneration, create a local Gradle init script that redirects `validateDebugScreenshotTest.testEngineInput.previewImageOutputDir`, `diffImageOutputDir`, `junitXmlOutputDirectory` and the task's HTML report to an external directory. The previous `/tmp` script is not a repository dependency. Run `:app:validateDebugScreenshotTest --init-script <local-script>`; rendering can succeed while comparison still reports missing reference images. Only approved references may establish a comparison baseline, and image binaries must never enter Git.

Related work: open PR #271 (`narumi/fix/favorites-list-space`) also changes Favorites layout and toolbar behavior. Review merge ordering and resolve overlapping edits before combining the branches; it has not been merged or incorporated here.
