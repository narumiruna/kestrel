# Password focus review follow-up

## Goal

Fix the new focus-restoration regression on PR #331 without changing password validation, API requests, or submission protections.

## Review Ledger

| Item | Evidence and scope | Severity | Outcome |
| --- | --- | --- | --- |
| [Password success focus](https://github.com/narumiruna/kestrel/pull/331#discussion_r4194878342) | Chrome records `focus()` while the trigger is disabled and expanded; after successful submission the form unmounts but the trigger is not focused, violating the PR's focus-restoration goal. | P2 | Already addressed in `142f7de`; verified reply published and thread resolved. |
| [Save selection](https://github.com/narumiruna/kestrel/pull/331#discussion_r4190764279) | Head and relevant source are unchanged since the prior verified fix in `a3cb96f`, and the published reply and resolved thread remain intact. | P2 | Already addressed. |
| [Drag overwrites fields](https://github.com/narumiruna/kestrel/pull/331#discussion_r4190764281) | Head and relevant source are unchanged since the prior verified fix in `a3cb96f`, and the published reply and resolved thread remain intact. | P1 | Already addressed. |
| New submitted review and activity summary | The updated review points to the new password finding and adds no independent request. | Informational | No independent actionable item. |

## Plan

- [x] Confirm repository, branch, changed feedback, and unchanged prior evidence without repeating prior validation.
- [x] Reproduce the disabled-trigger focus attempt using Chrome DevTools instrumentation.
- [x] Restore focus only after form closure and re-enabling have committed.
- [x] Verify success, cancellation, failure, initial focus, empty reopening, and submission protections in Chrome, and run affected Web gates.
- [x] Publish a signed fix, reply and resolve the new thread, and refresh PR state and checks.

## Completion Checklist

- [x] Success and cancellation return focus to the enabled, collapsed trigger; failure keeps the form open and does not steal focus.
- [x] Initial render does not focus the password trigger, reopening has empty sensitive fields, and submitting controls remain disabled.
- [x] All known feedback has a published outcome and relevant validation passes.

## Evidence

The pre-fix success run records a focus attempt with `disabled: true` and `aria-expanded: true`, followed by an unfocused trigger after form removal.
The fixed success and cancellation runs each record exactly one focus attempt with `disabled: false` and `aria-expanded: false`, and the trigger is the active element.
Initial render makes no focus attempt, error responses leave the form open without focusing the trigger, and reopening starts with empty sensitive fields.
During submission, the trigger, Cancel, submit button, and password inputs remain disabled.
The successful Chrome regression run has no application console errors or horizontal overflow at 1440 × 900.
All 66 Web tests, `just web-check`, `just web-lint`, `just web-typecheck`, `just web-build`, and `git diff --check` pass.
The 44 existing CSS warnings are unchanged.
Prior route browser checks were not repeated because their code and evidence are unchanged.

The fix in `142f7de` is published with a verified SSH signature, a review reply, and a resolved thread.
GitHub `changes` and `web` checks pass; Android and Backend checks are skipped because their workspaces are unchanged.
There are no deferred items, missing decisions, or blockers among the reviewed feedback.

## Validation Boundary

Chrome checks use the existing isolated external API fixture, not a live password change or real account.
The previous route ledger remains at `docs/plans/archived/2026-10-06_route-draft-review-plan.md`.
The unrelated `PLAN.md` and external screenshots are not included in Git changes.
