# Remote command rejection recovery

## Goal

Resolve [PR #372 feedback F1](https://github.com/narumiruna/kestrel/pull/372#discussion_r4398568547). A confirmed command rejection must show its error without retaining the unresolved-submission guard. An unknown submission result must keep that guard.

## Evidence and scope

The new tracker retains `pendingAction` for every POST failure. If the POST returns 409 before command creation, `command` stays null and Refresh cannot release the guard. This is a P2 defect introduced by the persistent operation state in PR #372.

`RemoteControlService.createCommand` rejects invalid input with 400, a missing device with 404, and a revoked or disabled device with 409 before enqueueing. Session middleware rejects with 401 before the route runs. The body limit rejects with 413 before the route runs. `ApiError` retains these statuses. Use this explicit set; do not infer rejection from error prose or classify all 4xx responses as safe.

Keep unknown errors, lost or malformed responses, request timeouts, server errors, and status-read failures unresolved. Do not retry POST automatically. Preserve owner/generation checks, dialog and Route-tab ownership, existing Stop policy, and safe localized errors. No backend, authentication, API, database, catalog, or physical-device change is included.

## Plan

- [x] Add failing tracker regressions for confirmed POST rejections, explicit retry/device selection, unknown failures, status-read failures, and stale-owner responses. Assert request counts and lock/busy/error states. Six rejection cases failed before the fix.
- [x] Release the guard only for the documented pre-enqueue `ApiError` statuses when no command was returned. Retain the error and require an explicit later send. All 55 focused tests pass.
- [x] Update the user guide and the original action-state plan to distinguish rejection from an unknown result. All 66 Chrome fixture checks pass at 1440×900 in light mode.
- [x] Run Web check, lint, tests, typecheck, build, i18n structure checks, intended-file hooks, and `git diff --check`. All pass. Review the complete new diff for safety, compatibility, regressions, and scope. The diff and independent review found no remaining material issue. Unrelated `PLAN.md` retains its original hash.
- [x] Prepare the review reply and verification evidence. PR #372 remains open on `narumi/fix/web-action-states`, with `main` as its base. The reply and publication evidence are prepared.

## Completion Checklist

- [x] A confirmed rejection leaves no unresolved operation or busy flag. Its error is visible. Device selection and an explicit later command can proceed when the device is ready. No automatic POST occurs.
- [x] Unknown submission failures and failed reads keep duplicate-send protection. Late results cannot change another owner or operation. Regression and Chrome evidence pass.
- [x] Required checks pass. The fix, review reply, and verification evidence are ready for publication. No unrelated file or image binary is staged.

Publication follows code validation: push the fix, post the evidence-backed reply, resolve F1 through GitHub, and verify the result. Do not resolve an unpublished or unverified fix.

## Verification evidence

Checks used Node.js 22.23.4 and Java 26 where hooks required it.

| Check | Result |
| --- | --- |
| Focused state tests | 55 passed, including 23 new rejection/failure cases. Six cases failed before the fix and passed after it. |
| Full Web suite | 264 passed; no failures, skips, or cancellations. |
| `just web-check` / `just web-lint` | Passed; 43 existing warnings and one Biome schema notice remain. |
| `just web-typecheck` / `just web-build` / `just i18n-check` | Passed; all 18 catalog structures are valid. No catalog changed. |
| Chrome DevTools fixtures | 66 passed: 28 rejection/failure checks, 30 Device regressions, and 8 Route-owner regressions on the production build. |
| Intended-file hooks / `git diff --check` | Passed. |
| Complete new diff / independent review | No remaining material issue. No backend, API, session, Stop policy, storage, or device change. |

Artifacts remain outside Git at `/private/tmp/kestrel-pr372-review.HI05Hv/`: `rejection-red.log`, `rejection-green.log`, gate logs, `rejection-browser-checks.json`, `device-browser-checks.json`, and `route-owner-browser-checks.json`. Browser requests change only in-memory fixtures. Captures and fixture payloads are not committed or attached.

The review ledger confirms one current finding, F1. Its P2 severity and scope are supported by the pre-enqueue rejection paths and the new persistent guard. Earlier findings about Refresh cleanup, stale read errors, local validation, and Route ownership are already addressed and retain passing regressions. The review receipt and summary contain no separate request. Publication and GitHub thread resolution remain separate from code verification; the PR reply records their result.

## External Handoff

The [original action-state plan](2026-10-28_web-action-state-review-plan.md) retains the physical-device and qualified-language acceptance handoffs. This fix uses no new messages. No qualified human language acceptance record is present in the PR evidence. The PR's ready state is not such a record. This work does not establish release readiness or real Android execution, ACK, replacement, or Stop timing.
