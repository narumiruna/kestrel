# Route assistant review fixes

## Goal

Resolve PR #373 merge conflicts against current `main` and fix the unauthenticated stalled-upload finding without changing route, authentication, or assistant behavior. Preserve the pre-existing untracked `PLAN.md` and all upstream Share/Device fixes.

## Plan

- [x] Merge `origin/main` locally without rewriting the published branch. Resolve manifests, catalogs, documentation, and editor conflicts while preserving both changes; validate catalogs and dependency locks.
- [x] Authenticate large assistant/route uploads before body reads at the Web proxy and Backend. Replace maximum-size preallocation with bounded incremental storage; add an absolute upload deadline, admission limit, and process-wide retained-byte accounting. Release resources on every completion, error, timeout, and abort path.
- [x] Add regression tests for unauthenticated and 32 stalled uploads, misleading/chunked lengths, timeout/cancellation, capacity exhaustion/recovery, exact valid uploads, and real authentication/streaming integration. No provider inference, database application, or device operation.
- [ ] Run affected Backend/Web checks, SDK fixtures, locale checks, and relevant production-build Chrome fixtures. Review the final diff and update PR #373 with the resolution and evidence.

## Completion Checklist

- [x] No unresolved merge conflicts; upstream and assistant behavior is preserved.
- [x] Unauthenticated uploads are rejected before large-body reads or allocation. Stalled uploads cannot reserve one maximum-size buffer each or remain admitted indefinitely.
- [x] In-flight requests and retained body storage have fixed process-wide limits at both hops. No failure path leaks capacity; valid 1000-point and screenshot requests remain accepted.
- [ ] Affected checks pass, only intended text files are committed, and `PLAN.md` remains unchanged.
- [ ] The PR branch is updated and the review finding has a concise evidence-backed reply.

## Verification Evidence

- Merged `origin/main` at `b428b22` without rewriting published history. Resolved the plan-index conflict; retained upstream Share/Device state, all 18 catalogs, and the assistant editor entry. Backend and Web `npm ci` passed after lockfile changes; Prisma client generation passed without a database operation.
- Both hops authenticate before body reads, admit at most 16 uploads, and charge at most 32 MiB of owned raw buffers, including temporary growth and final copies. The absolute 15-second deadline covers authentication and reception, not inference. Actual upload authentication rechecks revocation after reception.
- The 32-stalled-body regression at each hop admits 16 one-byte bodies with 16 KiB of retained upload buffers, not 32 maximum-size buffers. Timeout, abort, failed authentication, stalled cancellation, capacity exhaustion, late authentication, and recovery tests pass.
- Backend lint, 509 unit tests in 39 suites, 21 e2e tests in five suites, typecheck, build, and source/compiled offline SDK fixtures passed on Node.js 22.23.4. Web check/lint, 320 tests, typecheck, production build, and the 18-locale gate passed. Existing CSS-specificity/schema warnings and identical-to-English translation-review warnings remain; they did not fail these gates and are outside this fix.
- Production Next.js and Backend transport checks rejected 32 anonymous stalled uploads at each hop, returned 408 for authenticated unfinished uploads within 20 seconds, recovered capacity, and made no inference call. All seven upload checks and 102 existing Chrome DevTools checks passed at 1440×900 light mode, including exact 1000-point Apply/Save, streaming, cancellation, and capture/lifecycle cases.
- Reviewed the full follow-up diff for correctness, security, lifecycle safety, compatibility, regressions, and scope. No schema, Android source, image, or binary change is part of this follow-up. `git diff --check` passed. Reports and screenshots remain outside Git. This follow-up review was local; subagent startup failed, so no independent follow-up review is claimed.

## Limits and Recovery

Limits apply per process, not across replicas or all native allocations. Preserve existing inference/run deadlines and stream cancellation. Do not weaken session revocation or retry semantics. No migration, live provider/account action, deployment, release dispatch, or physical-device check is authorized by this follow-up. On failure, keep the PR open and retain unfinished checks here.
