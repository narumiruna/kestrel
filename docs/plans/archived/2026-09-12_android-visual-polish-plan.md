# Android visual polish

## Goal

Give Map, Favorites, and Settings a coherent, lighter Material 3 appearance without adding workflows or changing mock, storage, cloud, or permission behavior.

## Context

- Surface container roles currently inherit Material defaults rather than the app's blue/slate palette.
- Map target selection competes with the recenter control; the playback sheet nests its primary controls in another bordered card.
- Favorites repeats strong filled actions; collapsed Settings cards show both long explanations and summaries.
- The connected moto g34 5G is available for read-only inspection. Installation, navigation by ADB, restart, and connected instrumentation require separate approval. Screenshots stay outside the repository.

## Plan

- [x] Define coherent light/dark surface roles, rounded shapes, and shared header/card/icon treatments; `ThemeContrastTest` passes for both palettes (normal text ≥ 4.5:1).
- [x] Restyle the existing Map target action and playback controls, Favorites rows/search, Settings disclosures, and navigation; existing callbacks and runtime-state sources are retained.
- [x] Add representative Compose previews for both themes and narrow/large-text layouts; inspect external renders for Map, Favorites, Settings, expanded disclosures, and replacement confirmation. Large-text Settings actions reflow beneath the summary to avoid splitting headings.
- [x] Run Android formatting, Detekt, JVM tests, screenshot validation, and debug build; see validation evidence below.

## Non-Goals

- No new modes, dependencies, localization project, backend/web changes, data migrations, or mock-service lifecycle changes.
- No device installation, data clearing, or connected tests without explicit consent.

## Completion Checklist

- [x] Source review confirms existing actions and safety/confirmation behavior are preserved; no service, persistence, authentication, or sync code changed. Map overlays reserve room for the native compass and attribution.
- [x] New palette contrast tests and all 153 Android JVM tests pass (30 suites, no failures or skips).
- [x] `just android-check`, `just android-lint`, and `just android-build` pass with Java 26. Debug APK: `app/build/outputs/apk/debug/app-debug.apk`.
- [x] Light/dark and narrow/large-text renders have been inspected; screenshot validation outcome is documented accurately below.
- [x] `git diff --check` passes; no screenshot/image binaries appear in the Git changes.

## Validation Evidence

- Screenshot validation initially failed because the repository has no reference images. New local-only references were generated for review; all 26 previews subsequently rendered and validated without failures or skips. This checks the new local baseline, not regression against an approved historical baseline.
- Final screenshots, references, and validation XML are under `/tmp/kestrel-android-polish/final-review/`. The initial plugin configuration overrode early path settings; those generated images were moved outside the repository, and subsequent runs used late task configuration to keep image output external.
- Screenshot tasks used `./gradlew :app:updateDebugScreenshotTest :app:validateDebugScreenshotTest --init-script /tmp/kestrel-android-polish/screenshots.init.gradle` with the same Java 26 and Android SDK as `just android-ui`.
- After separate user approval, the APK was installed with `adb install -r` on the connected moto g34 5G. Local data was backed up first; DataStore and database files were byte-identical after this visual-polish update. No uninstall, data clearing, app launch, or connected instrumentation was performed; on-device interaction testing remains unverified.
