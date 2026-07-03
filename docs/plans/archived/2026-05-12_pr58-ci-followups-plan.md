# PR #58 CI Lanes Follow-ups

## Goal

Address review feedback on PR #58 (`copilot/add-backend-ci-test-lint-typecheck`) so that backend/web CI lanes are robust, do not silently break `main` merges, and have explicit (not implicit) dependencies. Success = PR #58 merges cleanly with required checks green, and the four follow-up items below are either landed or filed as bounded backlog entries.

## Context

PR #58 adds `backend` and `web` jobs to `.github/workflows/ci.yml`, renames the original `ci` job to `android`, adds a `biome` pre-commit hook, a `typecheck` script in `backend/`, and a `lint` script in `web/`. Review surfaced 8 points; this plan tracks the ones that affect correctness/merge-ability and pushes the rest to backlog.

## Non-Goals

- Adding `paths:` filter / per-workspace job gating (deferred to backlog).
- Adding web unit tests or e2e tests.
- Promoting backend `test:e2e` into CI.
- Making Android unit tests blocking.

## Assumptions

- `main` branch protection currently lists `ci` (the old single job name) as a required status check. To be verified in step 1.
- `@prisma/client` v5+ auto-runs `prisma generate` via its own postinstall, so backend specs currently type-check by accident; we want this explicit.
- Backend `*.spec.ts` files are pure unit tests with mocks and need no live Postgres or env vars.

## Plan

Ordered; steps 1–4 are merge-blockers for #58, step 5 is post-merge backlog grooming. PR #58 merged before this plan executed (merge commit `92aa04f`), so the follow-ups land in PR #59 against `main`.

- [x] Not applicable: `gh api repos/narumiruna/kestrel/branches/main/protection/required_status_checks/contexts` returned `Branch not protected` — `main` has no required status checks, so the `ci` → `android`/`backend`/`web` rename does not need a settings update.
- [x] **Added explicit `prisma generate` step** in the `backend` job of `.github/workflows/ci.yml` after `npm ci`. Verified by `gh run view --job 75413868903 --log | grep "Generate Prisma client"` showing `Prisma schema loaded from prisma/schema.prisma` and the step succeeding.
- [x] **Restored `npm run build` in `backend/README.md`** alongside `npm run typecheck`. Verified by `grep -E 'typecheck|build' backend/README.md` showing both `npm run typecheck` and `npm run build` in the validation block.
- [x] **Tightened pre-commit `biome` hook `files:` pattern** in `.pre-commit-config.yaml` to `^web/.*\.(ts|tsx|js|jsx|json|jsonc|css)$`. Verified by `prek run biome --files web/README.md` → `Skipped (no files to check)` and `prek run biome --files web/app/layout.tsx` → `Passed`.
- [x] **Filed three backlog entries** in `docs/plans/2026-05-10_engineering-backlog-plan.md` for: (a) per-workspace `paths:` filter on CI jobs, (b) optional `nest build` step in backend CI, (c) policy for promoting backend `test:e2e` into CI. They were later implemented in PR #60; the 2026-07-04 backlog cleanup removed those historical tags from the active backlog.

## Risks

- **Branch protection drift**: if step 1 is skipped, `main` will be unmergeable after #58 lands because the old `ci` check never reports. Mitigation: step 1 is gating.
- **Prisma postinstall behavior change**: future Prisma majors may drop auto-generate. Step 2 makes this explicit and immune to that change.
- **Pre-commit pattern over-tightening**: tightening `files:` could miss future config files (e.g. `web/biome.json` edits). Mitigation: included `json`/`jsonc` in the pattern.

## Rollback / Recovery

- Revert via `git revert` of the follow-up commit; the only production-touching surface is `.github/workflows/ci.yml`, which has no deploy side effects. Branch protection rule changes are reversible in repo settings.

## Completion Checklist

- [x] `gh pr checks 59` shows `android`, `backend`, `web` all `pass` (run `25687177914`); `backend` job log contains the `Generate Prisma client` step with `Prisma schema loaded from prisma/schema.prisma`.
- [x] Not applicable: `main` has no branch protection (`gh api repos/narumiruna/kestrel/branches/main/protection/required_status_checks/contexts` → `Branch not protected`), so there is no required-check list to align.
- [x] `backend/README.md` lists both `npm run typecheck` and `npm run build` in the validation block (`grep -E 'typecheck|build' backend/README.md`).
- [x] `.pre-commit-config.yaml` `biome` hook `files:` pattern excludes `web/README.md` and includes `web/app/**/*.tsx`, verified by `prek run biome --files web/README.md` (Skipped) and `prek run biome --files web/app/layout.tsx` (Passed).
- [x] The three PR #58 follow-up items were filed, then implemented in PR #60; current evidence is `.github/workflows/ci.yml` rather than active backlog tags.
- [x] PR #58 is merged to `main` (`gh pr view 58 --json state -q .state` → `MERGED`, merge commit `92aa04f`).
- [x] PR #59 is merged to `main` (`gh pr view 59 --json state,mergedAt,mergeCommit` returned `MERGED`, merge commit `44a6a7bfdda3d6ccd246c8edf8787b3fc77c3842`).
