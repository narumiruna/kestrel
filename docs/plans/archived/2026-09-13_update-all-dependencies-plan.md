# Update All Dependencies

## Goal

Update supported dependencies across Android, Backend, and Web, incorporating every open dependency pull request and any additional compatible updates found by the repository's update workflow.

## Context

All ten open pull requests target `main`, are Dependabot-authored, have no reviews or unresolved threads, are mergeable, and pass their affected CI job. Their changes overlap in `gradle/libs.versions.toml` and `web/package-lock.json`, so one combined local update is safer to verify than applying the branches independently.

## Plan

- [x] Run the repository's pinned npm-check-updates workflow for `backend/package.json` and `web/package.json`, then regenerate both lockfiles.
- [x] Run the Gradle version-catalog update task and review all manifest and lockfile changes against the ten open pull requests.
- [x] Apply only compatibility changes required by updated dependencies; no source compatibility changes were needed.
- [x] Run the available Android, Backend, and Web non-destructive verification gates. Android screenshot validation was attempted but is unavailable because this repository tracks no reference images; CI does not run that task.
- [x] Review npm audit results and the final diff for generated files, unexpected source changes, and prohibited binary files.
- [x] Re-read the remote pull-request queue and classify each initial pull request: all ten remain ready and green on `main`, while the combined local update contains or supersedes each proposed version.

## Risks

- React, Kotlin, Compose, Room, and MapLibre updates can introduce compile-time or runtime compatibility changes even when individual Dependabot CI jobs pass.
- Separate Web pull requests regenerate the same lockfile; combining updates can expose interactions not tested by each PR alone.
- Backend packages are not currently covered by Dependabot, so the repository update workflow may discover additional compatible releases.

## Completion Checklist

- [x] `gradle/libs.versions.toml`, `backend/package.json`, `backend/package-lock.json`, `web/package.json`, and `web/package-lock.json` reflect the supported updates.
- [x] Android CI-equivalent gates pass: Spotless, Detekt, JVM tests, and debug APK build. `just android-ui` is not applicable until reference images exist.
- [x] Backend Prisma generation, lint, unit tests, end-to-end tests, typecheck, and build pass.
- [x] Web Biome checks, unit tests, typecheck, production build, and `npm audit` pass.
- [x] Backend audit is reviewed: all compatible transitive fixes were applied; only GHSA-ggr8-5vv4-36mx remains through Prisma 6.19.3, and npm offers only an unsupported downgrade to 6.12.0 rather than a forward fix.
- [x] Every initially open pull request has a documented disposition, and no external push, merge, close, or comment occurred without explicit approval.
