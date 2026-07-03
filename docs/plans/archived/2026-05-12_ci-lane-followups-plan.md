# CI Lane Follow-ups (backlog items from PR #58 review)

## Goal

Land the three CI follow-ups that were filed in `2026-05-10_engineering-backlog-plan.md` after PR #58, in a single focused PR against `main`:

1. Per-workspace `paths:` gating so each job only runs when its workspace changes.
2. Add `nest build` step to the `backend` job so `nest-cli.json` / asset-copy regressions are caught (currently only `typecheck` runs).
3. Promote backend `test:e2e` into the `backend` job, now that we have confirmed e2e specs use `overrideProvider(PrismaService)` and do not need a Postgres service.

Success = all three jobs still green on this PR, `backend` job log shows new `Build` and `Test (e2e)` steps, and a doc-only PR (e.g. README change) demonstrates that `android` / `backend` / `web` jobs correctly skip when their files are not touched.

## Context

- PR #58 added `android`, `backend`, `web` jobs to `.github/workflows/ci.yml`. PR #59 hardened the backend job (`prisma generate`) and tightened the biome hook. The three items below were deferred there.
- `backend/test/*.e2e-spec.ts` import `PrismaService` only to call `.overrideProvider(PrismaService).useValue(MockPrismaService)`; they set `AUTH_*` env vars at module init. No live DB or service container is needed.
- `main` is not branch-protected (confirmed in PR #59 plan), so skipped jobs via `paths:` filtering will not block merges via "required check missing" semantics.

## Non-Goals

- Adding a Postgres service container to CI.
- Running e2e on a nightly schedule.
- Migrating Android unit tests from `continue-on-error: true` to blocking.
- Adding web tests.
- Touching deploy workflows (`compose.deploy.yaml` etc.).

## Assumptions

- `dorny/paths-filter@v3` is acceptable as a third-party action; it's widely used and pinned by major version.
- `npm run build` in `backend/` (which is `nest build`) does not require any env vars beyond what `npm ci` already provides.
- E2e specs continue to fully mock `PrismaService`; if a future spec needs a real DB, this plan's e2e step will need a follow-up (out of scope).
- For push events to `main`, all three jobs should always run (not be gated), so post-merge regressions are caught even when the merge itself only touched one workspace.

## Architecture

`.github/workflows/ci.yml` gains one new lightweight `changes` job that produces per-workspace boolean outputs via `dorny/paths-filter@v3`. The existing `android`, `backend`, `web` jobs declare `needs: changes` and an `if:` guard:

```
if: github.event_name == 'push' || needs.changes.outputs.<lane> == 'true'
```

Path globs:

- `android`: `app/**`, `build.gradle.kts`, `settings.gradle.kts`, `gradle.properties`, `gradle/**`, `detekt*.yml`, `detekt*.xml`, `justfile`, `.github/workflows/ci.yml`
- `backend`: `backend/**`, `.github/workflows/ci.yml`
- `web`: `web/**`, `.github/workflows/ci.yml`

The workflow itself is in every set so that workflow edits always re-run everything.

## Plan

- [x] Added a `changes` job to `.github/workflows/ci.yml` using `dorny/paths-filter@v3` that emits `android`, `backend`, `web` outputs. Verified by `prek run check-yaml --files .github/workflows/ci.yml` Passed.
- [x] Added `needs: changes` plus `if: github.event_name == 'push' || needs.changes.outputs.<lane> == 'true'` to each of `android`, `backend`, `web` jobs. Verified by reading the merged diff (PR #60).
- [x] Added a `Build` step (`run: npm run build`) to the `backend` job after `Typecheck`. Verified in CI run 25687758702 (backend job log shows `Build: success`).
- [x] Added a `Test (e2e)` step (`run: npm run test:e2e`) to the `backend` job after `Test`. Verified in CI run 25687758702 (backend job log shows both `Test: success` and `Test (e2e): success`). Also fixed a bit-rot in `backend/test/sync.e2e-spec.ts` (hard-coded past `expiresAt`) surfaced by promoting e2e into CI.
- [x] Marked the three `Surfaced by PR #58 review` items complete at implementation time. The 2026-07-04 backlog cleanup later removed those historical tags from the active backlog; current evidence is `.github/workflows/ci.yml`.
- [x] Opened PR #60 against `main`; CI run 25687758702 showed all three lanes `pass` (workflow-self glob forced them to run).
- [x] After merging #60, validated skip path with PR #61 (docs-only README change). `gh run view 25688009020` showed `changes: success`, `android: skipped`, `backend: skipped`, `web: skipped`.

## Risks

- **Required-check drift**: If `main` becomes branch-protected later with `android`/`backend`/`web` as required, skipped jobs report as "missing" and block PRs. Mitigation: documented in this plan; if/when protection is enabled, replace `if:` skip with a no-op success step pattern.
- **Path glob misses**: A new top-level file (e.g. a new `gradle.properties.kts` variant) might not match any lane and silently skip all CI. Mitigation: include `.github/workflows/ci.yml` itself in every lane so workflow changes always re-run everything, and review path globs whenever directory structure changes.
- **`nest build` env requirements surfacing late**: If `nest build` needs env vars not present in `npm ci` context, the new step will fail. Mitigation: caught immediately by this PR's own CI run.
- **E2e flake**: Mocked e2e is generally stable, but adding it expands the surface that can flake. Mitigation: keep step blocking; revert if it flakes within first week and re-investigate.

## Rollback / Recovery

- Single-PR revert via `git revert <merge-sha>`. No prod surface, no migrations, no consumer-visible behavior. Branch protection is unaffected (main is unprotected).

## Completion Checklist

- [x] `.github/workflows/ci.yml` contains a `changes` job using `dorny/paths-filter@v3` with `android`, `backend`, `web` outputs (verified by reading the merged file).
- [x] Each of `android`, `backend`, `web` jobs declares `needs: changes` and the `if: github.event_name == 'push' || needs.changes.outputs.<lane> == 'true'` guard.
- [x] `backend` job includes both `Build` and `Test (e2e)` steps; CI run 25687758702 shows both steps succeeding.
- [x] `gh pr checks 60` showed `android`, `backend`, `web` all `pass` on the PR (workflow edit forced all lanes to run).
- [x] Follow-up docs-only PR #61 (https://github.com/narumiruna/kestrel/pull/61) demonstrated `android` / `backend` / `web` all `skipped` and only `changes` running (run 25688009020).
- [x] The three PR #58 CI follow-ups are implemented in `.github/workflows/ci.yml`; the active backlog was later curated and no longer carries the historical `Surfaced by PR #58 review` tags.
- [x] PR #60 merged to `main` (commit `d622ba4`); PR #61 merged to `main` shortly after.
