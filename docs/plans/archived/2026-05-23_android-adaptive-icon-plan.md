# Android adaptive icon plan

## Goal

Replace the default Android Studio launcher icon with Kestrel-branded adaptive icon assets that build cleanly and are visually acceptable in normal, round, and themed/monochrome launcher contexts.

## Context

The app currently points `android:icon` and `android:roundIcon` at `@mipmap/ic_launcher` / `@mipmap/ic_launcher_round`, whose adaptive foreground/background are still the default Android robot and green grid (`app/src/main/res/drawable/ic_launcher_foreground.xml`, `app/src/main/res/drawable/ic_launcher_background.xml`). The engineering backlog tracks this as an app-polish item, and its first-impression checklist remains open until the icon is replaced.

## Non-Goals

- Do not change the app label, package name, notification small icon, or in-app branding.
- Do not introduce a design-tool dependency or generated binary-only source of truth for the icon.
- Do not localize or theme the rest of the app in this slice.

## Assumptions

- A simple vector-based Kestrel mark is acceptable for this slice if it clearly avoids the Android Studio default icon.
- Existing density-specific legacy WebP launcher icons may be removed or regenerated only if needed; the adaptive XML assets remain the source of truth for modern launchers.

## Unknowns

- Final visual direction is not specified. Resolve by creating a small candidate mark and treating user visual acceptance, screenshot review, or explicit approval as part of completion.

## Plan

- [x] Inspect current launcher references in `app/src/main/AndroidManifest.xml` and `app/src/main/res/mipmap-anydpi/ic_launcher*.xml` to confirm the manifest can keep using `@mipmap/ic_launcher` and `@mipmap/ic_launcher_round`; verified by file inspection before editing.
- [x] Replace `app/src/main/res/drawable/ic_launcher_background.xml` with a Kestrel-branded vector background that is not the Android Studio green grid; verified by reading the file and by `rg -n '#3DDC84|Android|android robot|31,63\.928|65\.3,45\.828' app/src/main/res/drawable/ic_launcher_background.xml app/src/main/res/drawable/ic_launcher_foreground.xml app/src/main/res/drawable/ic_launcher_monochrome.xml` returning no output.
- [x] Replace `app/src/main/res/drawable/ic_launcher_foreground.xml` with a Kestrel-branded foreground mark that fits the 108dp adaptive icon safe zone, and add `app/src/main/res/drawable/ic_launcher_monochrome.xml` for themed launchers; verified by reading the vector viewport/paths and captured preview review at `/tmp/kestrel-icon-preview.svg.png`.
- [x] Decide whether to keep, remove, or regenerate density-specific legacy WebP launcher icons under `app/src/main/res/mipmap-*dpi/`; removed them because `minSdk = 29` and the adaptive XML assets are the modern source of truth, verified with `find app/src/main/res -maxdepth 2 -name 'ic_launcher*.webp' -print` returning no output.
- [x] Build the app resources with `just build` to confirm the icon XML compiles into the debug APK.
- [x] Run `just check` to confirm formatting checks still pass.
- [x] Update `docs/plans/2026-05-10_engineering-backlog-plan.md` to mark the app icon item complete, and if both notification wording and app icon are complete, mark the app-polish completion checklist item complete; verified by reading the backlog diff.

## Risks

- Adaptive icon clipping can hide important parts of the mark on round/squircle launchers; keep the foreground mark inside the safe zone and use visual review.
- Android 13 themed icons use the monochrome layer; a colorful foreground reused as monochrome may look poor unless the vector is shape-driven.
- Legacy WebP launcher icons can still appear on older devices or tooling if left as Android Studio defaults.

## Completion Checklist

- [x] The launcher icon no longer uses Android Studio default foreground/background artwork, verified by `ic_launcher_background.xml`, `ic_launcher_foreground.xml`, and `ic_launcher_monochrome.xml` contents plus the stale-default `rg` check returning no output.
- [x] Normal, round, and monochrome adaptive icon references still resolve through `app/src/main/res/mipmap-anydpi/ic_launcher.xml` and `ic_launcher_round.xml`, verified by file inspection and `just build`.
- [x] Legacy density WebP icon handling is explicitly completed, verified by removing the old default WebP assets and `find app/src/main/res -maxdepth 2 -name 'ic_launcher*.webp' -print` returning no output.
- [x] The icon candidate is visually accepted, verified by captured screenshot review of `/tmp/kestrel-icon-preview.svg.png` showing adaptive, round, and monochrome previews without clipping.
- [x] Repository checks pass, verified by `just check`.
- [x] The engineering backlog app icon item and app-polish completion checklist are updated with evidence in `docs/plans/2026-05-10_engineering-backlog-plan.md`.
