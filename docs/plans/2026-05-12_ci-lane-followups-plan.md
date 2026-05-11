# CI Lane Follow-ups (backlog items from PR #58 review)

## Goal

Land the three CI follow-ups that were filed in `engineering-backlog-plan.md` after PR #58, in a single focused PR against `main`:

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

- [ ] Add a `changes` job to `.github/workflows/ci.yml` using `dorny/paths-filter@v3` that emits `android`, `backend`, `web` outputs based on the path globs above; verify by `yamllint .github/workflows/ci.yml` (or `pre-commit run check-yaml --files .github/workflows/ci.yml`) passing.
- [ ] Add `needs: changes` plus `if: github.event_name == 'push' || needs.changes.outputs.<lane> == 'true'` to each of `android`, `backend`, `web` jobs; verify by reading the diff and confirming each lane has the guard.
- [ ] Add a `Build` step (`run: npm run build`) to the `backend` job after `Typecheck`; verify in the next CI run by seeing the step succeed in the `backend` job log.
- [ ] Add a `Test (e2e)` step (`run: npm run test:e2e`) to the `backend` job after `Test`; verify in the next CI run by seeing both `Test` and `Test (e2e)` succeed.
- [ ] In `docs/plans/engineering-backlog-plan.md`, mark the three `Surfaced by PR #58 review` items as `[x]`; verify by `grep -c '\[x\] .*Surfaced by PR #58 review' docs/plans/engineering-backlog-plan.md` returning `3`.
- [ ] Open PR against `main`; verify the PR's own CI run shows all three jobs `pass` (touching `.github/workflows/ci.yml` forces all lanes via the workflow-self glob).
- [ ] After merging, validate the skip path with a tiny docs-only PR (e.g. typo fix in any `docs/**` file): `gh pr checks` should show `android`, `backend`, `web` as `Skipped` and only the `changes` job running. `dorny/paths-filter` on `pull_request` compares against the merge base, so the skip cannot be proven inside the same PR that edits `ci.yml`.

## Risks

- **Required-check drift**: If `main` becomes branch-protected later with `android`/`backend`/`web` as required, skipped jobs report as "missing" and block PRs. Mitigation: documented in this plan; if/when protection is enabled, replace `if:` skip with a no-op success step pattern.
- **Path glob misses**: A new top-level file (e.g. a new `gradle.properties.kts` variant) might not match any lane and silently skip all CI. Mitigation: include `.github/workflows/ci.yml` itself in every lane so workflow changes always re-run everything, and review path globs whenever directory structure changes.
- **`nest build` env requirements surfacing late**: If `nest build` needs env vars not present in `npm ci` context, the new step will fail. Mitigation: caught immediately by this PR's own CI run.
- **E2e flake**: Mocked e2e is generally stable, but adding it expands the surface that can flake. Mitigation: keep step blocking; revert if it flakes within first week and re-investigate.

## Rollback / Recovery

- Single-PR revert via `git revert <merge-sha>`. No prod surface, no migrations, no consumer-visible behavior. Branch protection is unaffected (main is unprotected).

## Completion Checklist

- [ ] `.github/workflows/ci.yml` contains a `changes` job using `dorny/paths-filter@v3` with `android`, `backend`, `web` outputs (verified by `grep -E 'dorny/paths-filter|outputs:' .github/workflows/ci.yml`).
- [ ] Each of `android`, `backend`, `web` jobs declares `needs: changes` and the `if: github.event_name == 'push' || needs.changes.outputs.<lane> == 'true'` guard (verified by inspecting `.github/workflows/ci.yml`).
- [ ] `backend` job includes both `Build` and `Test (e2e)` steps after the existing steps (verified by reading the workflow file and by the corresponding step names appearing in the PR's CI run log).
- [ ] `gh pr checks <new-pr>` shows `android`, `backend`, `web` all `pass` on the PR (workflow edit forces all lanes to run).
- [ ] After merge, a follow-up docs-only PR demonstrates `android` / `backend` / `web` all reported as `Skipped` (verified by `gh pr checks <docs-pr>`); URL recorded in this checklist item.
- [ ] `docs/plans/engineering-backlog-plan.md` has all three `Surfaced by PR #58 review` items marked `[x]` (verified by `grep -c '\[x\] .*Surfaced by PR #58 review' docs/plans/engineering-backlog-plan.md` → `3`).
- [ ] The new PR is merged to `main` (verified by `gh pr view <new-pr> --json state -q .state` → `MERGED`).
