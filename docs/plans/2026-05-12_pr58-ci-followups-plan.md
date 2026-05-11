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

Ordered; steps 1–4 are merge-blockers for #58, step 5 is post-merge backlog grooming.

- [ ] **Verify branch protection required checks** on `main` via `gh api repos/narumiruna/kestrel/branches/main/protection/required_status_checks/contexts`; if `ci` is listed, update to `android`, `backend`, `web` (or ask user to do it in repo settings) before merging #58. Acceptance: command output shows the new job names, or user confirms update done.
- [ ] **Add explicit `prisma generate` step** in the `backend` job of `.github/workflows/ci.yml`, right after `npm ci`, running `npx prisma generate`; verify by re-running the workflow on the PR and seeing the step succeed (`gh run watch` or PR checks tab).
- [ ] **Restore `npm run build` in `backend/README.md`** alongside `npm run typecheck` (do not replace one with the other); verify by `grep -E 'typecheck|build' backend/README.md` showing both lines under the available-commands block.
- [ ] **Tighten pre-commit `biome` hook `files:` pattern** in `.pre-commit-config.yaml` from `^web/.*$` to `^web/.*\.(ts|tsx|js|jsx|json|jsonc|css)$`; verify with `prek run biome --files web/README.md` skipping and `prek run biome --files web/app/page.tsx` running.
- [ ] **File backlog entries** in `docs/plans/engineering-backlog-plan.md` for: (a) per-workspace `paths:` filter on CI jobs, (b) optional `nest build` step in backend CI, (c) decide policy for promoting backend `test:e2e` to CI. Verify by `grep` finding the three new `- [ ]` lines.

## Risks

- **Branch protection drift**: if step 1 is skipped, `main` will be unmergeable after #58 lands because the old `ci` check never reports. Mitigation: step 1 is gating.
- **Prisma postinstall behavior change**: future Prisma majors may drop auto-generate. Step 2 makes this explicit and immune to that change.
- **Pre-commit pattern over-tightening**: tightening `files:` could miss future config files (e.g. `web/biome.json` edits). Mitigation: included `json`/`jsonc` in the pattern.

## Rollback / Recovery

- Revert via `git revert` of the follow-up commit; the only production-touching surface is `.github/workflows/ci.yml`, which has no deploy side effects. Branch protection rule changes are reversible in repo settings.

## Completion Checklist

- [ ] `gh pr checks 58` shows `android`, `backend`, `web` all green, with `backend` including a visible `Generate Prisma client` step in the job log.
- [ ] `main` branch protection required checks list matches the three job names, verified by `gh api repos/narumiruna/kestrel/branches/main/protection/required_status_checks/contexts` or explicit user confirmation.
- [ ] `backend/README.md` lists both `npm run typecheck` and `npm run build` in the commands block (verified by `grep`).
- [ ] `.pre-commit-config.yaml` `biome` hook `files:` pattern excludes `web/README.md` and includes `web/app/**/*.tsx` (verified by two `prek run biome --files …` invocations).
- [ ] `docs/plans/engineering-backlog-plan.md` contains three new `- [ ]` items for the deferred follow-ups (paths filter, `nest build` in CI, e2e-in-CI policy), verified by `grep`.
- [ ] PR #58 is merged to `main` (verified by `gh pr view 58 --json state -q .state` returning `MERGED`).
