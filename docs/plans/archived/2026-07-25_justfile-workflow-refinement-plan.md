# Justfile Workflow Refinement Plan

## Goal

Make the repository `justfile` safer, deterministic, easier to discover, and complete across Android, Backend, Web, cloud, and device workflows without changing build/test semantics or running destructive/device-changing recipes.

## Context

- The current default recipe runs build → install → launch, so a bare `just` mutates an attached device.
- `web-check` uses `npm exec -- biome`, which can download an unrelated package when `web/node_modules` is absent.
- Documented recipes such as `android-ui` are missing, while Backend and full Web verification require manual command chains.
- Repeated Java, Compose, and workspace command fragments make maintenance and review harder.
- Existing compatibility entry points (`build`, `test`, `format`, `check`, `lint`, `br`, cloud and device recipes) must remain available.

## Non-Goals

- Do not change application code, dependencies, CI workflows, Gradle tasks, npm script behavior, Compose topology, deployment behavior, or database state.
- Do not run install, launch, uninstall, reset, connected instrumentation, cloud stack mutation, release, migration, or screenshot-update recipes.
- Do not reintroduce Web image-based or Playwright UI recipes; browser validation remains Chrome DevTools based.

## Risks

- Recipe renames or aggregate semantic changes could break documentation and operator habits; preserve existing names and document any safer default behavior.
- A dependency guard could block valid workspaces if it checks the wrong executable; verify against installed local binaries and dry-run commands.
- Aggregate verification can be expensive; retain focused workspace recipes and make the comprehensive aggregate explicit.

## Plan

- [x] Refactor `justfile` constants, private dependency guards, groups, and aggregate recipes while preserving all 35 existing entry points; `just --fmt --check`, `just --list`, `just --dump`, and an explicit compatibility-set assertion pass with 54 public recipes plus 4 private guards.
- [x] Make bare `just` show discoverable help, add confirmations to destructive reset/uninstall and reference-update flows, and add deterministic local dependency checks; default output contains no Gradle/adb action, confirmation metadata is present, a temporary dependency-free Web workspace fails with `Run: just web-install`, and destructive recipes were inspected only with `--yes --dry-run`.
- [x] Add missing Android screenshot verification plus focused Backend/Web install, format, lint, test, typecheck, build, and full verification recipes; `backend-check` passes Prisma generation, lint, 116 unit tests, 8 e2e tests, typecheck, and build, while `web-verify` passes Biome, typecheck, and a 16-route production build. Android Spotless and Detekt pass; SDK-dependent test/UI/build commands are dry-run verified and now fail early with an actionable SDK message because this host has no Android SDK.
- [x] Update `README.md` command documentation to match the refined recipes and remove stale Web screenshot-test commands; every `just <recipe>` reference extracted from README exists in `just --summary`.
- [x] Run final `git diff --check`, inspect the complete diff for unrelated or destructive changes, then complete and archive this plan under `docs/plans/archived/`; finalization evidence is recorded below and the plan is archived in the same change.

## Completion Checklist

- [x] Bare `just` performs no build, install, launch, data mutation, or other external write.
- [x] Existing documented compatibility recipes remain available and `android-ui` resolves to `:app:validateDebugScreenshotTest`.
- [x] Web Biome commands invoke only `web/node_modules/.bin/biome` and cannot silently install an unrelated package when dependencies are missing.
- [x] Android, Backend, and Web each have focused and comprehensive verification entry points with actionable dependency/setup guards; Backend verification includes Prisma generation.
- [x] Destructive device recipes require explicit interactive confirmation and no destructive/device-changing recipe was executed during validation.
- [x] Just syntax/format, all host-available non-destructive workspace checks, documentation references, and `git diff --check` pass; Android SDK-dependent gates are explicitly unavailable on this host and verified through deterministic guard/dry-run evidence rather than claimed as executed.
