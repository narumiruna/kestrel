# Web action-state review and implementation plan

## Goal

Make Share and Device dialogs report the current operation correctly. A failed or late read must not erase a successful result, claim that no public link exists, or enable a duplicate command.

Use the proposed image below as the visual reference. This PR contains review evidence and a plan only. No application fix is implemented; all implementation tasks remain open.

## Context

- Application source reviewed: `6c78465023c850aaf9df40f019571a18fb670323`, after PRs #368 and #369. The same Web source is present in the updated `main` at `93132475ad8fc3196c05510d18713b88f2a2ade8`; the intervening changes are documentation only.
- Relationship: [PR #370](https://github.com/narumiruna/kestrel/pull/370) was merged during this review and remains a separate documentation-only workspace review. Its Refresh/draft-exit, Library-context, Delete-focus, and Route-layout findings remain unresolved. This plan adds three action-state findings; it neither replaces that PR nor moves its unfinished work here.
- Method: local production Web build, Google Chrome through Chrome DevTools Protocol, 1440×900 CSS pixels, light mode, English. No Playwright was used.
- Data: browser-local fixtures for Places, Routes, share responses, and one synthetic Android device. Share writes and command submissions changed in-memory fixture state only. No database, real account, public link, or physical-device state changed.
- Map: the current MapLibre view reached ready state with five Route markers. This confirms rendering in this local capture, not production availability or map correctness in all environments.
- Review coverage: delayed/error Share reads and Device command submission, failed polling, recovery, and dialog reopening. Authentication, real Android execution, other viewports, and other appearance modes were not tested.

## Findings

### A1 — P1: A late Share read erases a successful Create

Sources: [share-state hook](../../web/components/dashboard/useShareLink.ts#L19-L60), [Route Share controls](../../web/components/dashboard/RouteSharePanel.tsx#L43-L75), and [Place Share controls](../../web/components/dashboard/PlaceEditor.tsx#L390-L422).

The initial lookup and mutation both write `shareLink` without response-order protection. Route and Place enable Create while that lookup is pending. The UI also interprets a null value as a confirmed missing link when the lookup has failed.

Chrome reproduction:

1. Open Share saved revision with the initial GET held at a captured 404 result.
2. Observe Loading, Public link: Not created, and an enabled Create public link button together.
3. Create a synthetic link. Observe Public link: Active and its URL.
4. Release the older GET. The URL disappears and Public link: Not created returns, although the Create response succeeded.
5. Reopen with GET returning 503. The dialog again reports Not created, offers Create, and has no read-retry action.

One fixture mutation occurred. The evidence establishes a display/state race, not creation of a real public link. The Library Share view already hides Create during loading, but its error/unknown behavior and the shared hook still need regression coverage.

**Required result:** represent unknown, loading, confirmed missing, active, disabled, and read error separately. Only a confirmed missing result enables Create. Retry repeats the read, not the mutation. A late response must not overwrite a newer successful write or another item/session's state.

### A2 — P2: Device Refresh does not recover command state

Sources: [send/poll handling](../../web/components/dashboard/RemoteControlPanel.tsx#L192-L213), [Refresh action](../../web/components/dashboard/RemoteControlPanel.tsx#L303-L314), and [device loading/polling](../../web/components/dashboard/useRemoteDevices.ts#L129-L160).

A polling error ends the send operation. Refresh reloads devices but does not reconcile the panel's separate command or clear its command error.

Chrome reproduction:

1. Submit synthetic command C; return C as QUEUED.
2. Fail the following device GET with 503. Observe the command-confirmation error.
3. Change the fixture's latest command to the same C/APPLIED.
4. Select Refresh and return a successful device response.
5. Observe that the old error and QUEUED status remain visible despite C/APPLIED in the response.

**Required result:** reconcile the tracked command from a successful read with the same account/session, device ID, and command ID. Clear the resolved status-read error. Refresh never sends another command. A different or missing `lastCommand` is not evidence that C succeeded.

### A3 — P1: Closing the Device dialog discards pending state

Sources: [dialog-owned command state](../../web/components/dashboard/RemoteControlPanel.tsx#L154-L168), [send gating](../../web/components/dashboard/RemoteControlPanel.tsx#L287-L314), and [dialog content lifecycle](../../web/components/ui/radix-ui.tsx#L234-L267).

Command/pending/error state belongs to the dialog content, which unmounts on Close. The device hook remains mounted, but reopening creates fresh controls that ignore the pending command.

Chrome reproduction:

1. Submit synthetic command C and retain C/QUEUED in device responses.
2. Observe Sending and disabled send controls.
3. Close and reopen the same Device dialog.
4. Observe Ready to send and an enabled Mock on device button, while the fixture still reports C/QUEUED.

One command had been submitted when the reopened state was captured. The enabled control permits another submission; this review did not send a second command or test real Android duplication.

**Required result:** closing the dialog must not discard tracking or imply cancellation. Reopening restores C and its unresolved status. Keep the duplicate-send guard while that operation is unresolved; sending a later command remains an explicit user action.

## Proposed image

- Local image: `/private/tmp/kestrel-action-state-review.gRbyqn/proposed-action-states.png`.
- Size: 1536×1024 pixels. It is a four-state storyboard for the 1440×900 desktop target, not four dialogs displayed at once.
- SHA-256: `5cce0e9f321279a2d18fc129d15cde459d9cd7549a90d1e15be899c1145be1d9`.
- Image binaries and captures remain outside Git and PR attachments under repository policy. This path is local and temporary; the design contract below is the retained reference.

### Design contract

| Image region | Required behavior | Finding |
| --- | --- | --- |
| Share: checking | Show Checking link status with `aria-busy` and a status announcement. Do not show Not created/Active/Disabled as a known result. Create is unavailable. | A1 |
| Share: read failure | Show Could not check link status and one Retry action. Do not offer Create as recovery. Retry issues GET only; retain the saved-item/revision description. | A1 |
| Device: pending or status unavailable | Retain the tracked command and last confirmed protocol status. State that its result is unconfirmed and the command may still run. Offer Refresh status when a read can be retried safely; do not repeat submission. | A2, A3 |
| Device: recovered | A successful matching C/APPLIED response replaces the old queued/error presentation. Announce Applied on Android once. An unrelated command response must not produce this state. | A2 |
| Device: Close | Closing and reopening the dialog restores the same tracked operation. Close does not cancel execution or reset the duplicate-send guard. | A3 |

Keep Radix Themes, Primitives, Colors, and Icons; MapLibre; the current sans-serif typography; white surfaces; and the existing blue action color. Use text and an icon with status color. Keep visible focus, dialog focus return, and a single recovery action for each failed read.

The image does not change existing command policy:

- Stop during submission/acknowledgement polling remains governed by current behavior. Do not enable it solely to match a picture or imply immediate cancellation.
- The pictured Refresh status disabled state is illustrative, not a new permanent restriction after success. Retain explicit read-only refresh where useful.
- The command reference is a shortened existing ID, not a new history feature or protocol field.
- Revision 2, device name, coordinates, and map details are sample data, not new fields or a fixed revision.
- Route Share still uses the latest saved revision; Place Device uses the saved point; Route Device keeps its existing saved/draft distinction. No implicit Save is added.

### Regeneration brief

Generate a landscape engineering storyboard titled Kestrel Cloud · reliable action states. Show four separate existing-style Radix dialogs: Share checking with disabled Create; Share read error with Retry; Device command queued/status-read failure with Refresh status and retained pending state across Close; and the same command confirmed Applied with the old error removed. Use the current light-mode desktop visual language. Add A1/A2/A3 captions outside the dialogs. Keep the existing command and sharing contracts; do not add instant cancellation, command history, offline persistence, or a new workspace layout.

## Architecture and limits

- Share state remains owned by the existing shared hook. Use explicit request state and request/mutation identity bound to the current authentication session and item kind/ID. A successful mutation invalidates older reads. Clear ownership on item/session change. Do not store public-link tokens or response payloads in new browser storage or logs.
- Command tracking must have a mounted owner outside dismissible dialog content. First verify the smallest owner that survives Close/reopen and the relevant Place/Route control lifecycle; keep tightly coupled tracking logic together. Scope operation identity to authentication session, device ID, and command ID. Clear it on session loss or workspace-owner unmount; this plan does not promise reload/offline recovery.
- Reuse the existing `refresh()` device response for reconciliation. [The current lookup](../../web/components/dashboard/useRemoteDevices.ts#L212-L220) exposes only a device's latest command, not command history. Preserve an unknown-result state when the tracked command cannot be matched. Do not infer success from online state, playback state, an unrelated command, or elapsed time.
- Keep terminal command results stable against late older reads. A failed POST with no returned command ID is an ambiguous submission, not proof that Android rejected it; do not add automatic resubmission.
- Preserve [remote-control expiry, ACK, ownership, and revocation semantics](../remote-control-api.md). No Backend schema, endpoint, queue-order, Stop, session, or authentication change is planned. If implementation discovers that an API change is necessary, stop that dependent work and document the required authorization rather than silently expanding this plan.

## Non-Goals

- No implementation of PR #370's separate findings, and no replacement of the broader workspace plan.
- No new layout system, UI/map package, global command history, reload persistence, automatic command retry, or cancellation API.
- No database changes, real public links, real-device commands, deployment, or merge in this planning PR.
- No mobile, dark-mode, zoom, or other presentation matrix beyond the established desktop baseline.

## Plan

- [ ] Add failing state-model regressions for A1–A3 before changing UI. Cover delayed GET versus successful mutation, failed read versus confirmed missing, matching and unrelated command responses, and dialog-owner lifetime. Record the selected command-state owner and its cleanup rules; tests must demonstrate that Close does not own operation state.
- [ ] Update `useShareLink` with explicit read state, current-item/session ownership, and late-response protection. Guard mutations during unknown/loading/read-error/mutating state. Prove that older GET success/404/failure cannot overwrite a newer mutation, and that a current read failure cannot claim a missing link.
- [ ] Apply the Share state contract to Route, Place, and Library dialogs using existing Radix controls. Add read-only Retry, accessible loading/error feedback, and correct missing/active/disabled states. Verify keyboard Retry and connected focus return; preserve saved-snapshot descriptions and existing enable/disable behavior.
- [ ] Move command/submission/error tracking to the selected mounted owner outside dialog content. Retain pending operations across Close, Escape, and reopening. Prove that rapid reopening or repeated clicks cannot submit another copy of the same unresolved operation, including Close before POST resolves; session loss and owner unmount must clean up safely.
- [ ] Reconcile command state and resolved read errors after Refresh and polling using the same device/command identity. Cover matching APPLIED/FAILED/EXPIRED, continued QUEUED/DELIVERED, missing/different command, stale responses, and repeated read failure. Assert that all recovery requests are GETs and the command POST count stays unchanged.
- [ ] Add the image's state labels to the existing message namespaces in all 18 supported locale catalogs. Use safe translated API errors, `aria-busy`, live status/error feedback, and existing Radix icons. Verify that unknown, pending, failed, and confirmed states do not depend on color alone.
- [ ] Capture before/after Chrome DevTools evidence at 1440×900 in light mode with controlled browser-local fixtures. Exercise Route/Place/Library Share and both Device command sources, delayed reads, failed reads, creation, recovery, Close/reopen, and keyboard focus. Keep artifacts outside the repository; assert request methods/counts as well as visible labels.
- [ ] Update `docs/web-cloud-guide.md` after behavior is implemented: explain read-only Retry/Refresh, saved versus draft sources, unresolved command results, and Close versus cancellation. Run `just web-check`, `just web-lint`, `just web-test`, `just web-typecheck`, `just web-build`, `just i18n-check`, document hooks, and `git diff --check`. Review the final diff for unintended source, generated cache, binary, or API/security changes.

## Completion Checklist

- [ ] A1: all three Share surfaces distinguish unknown/loading/error from confirmed missing; Create cannot race the initial read; stale responses cannot erase a successful mutation. Regression and browser evidence pass.
- [ ] A2: Refresh replaces stale command/error presentation only from a matching current response, preserves unknown results, and never submits a command. Terminal/late-response and failed-recovery cases pass.
- [ ] A3: Close/Escape/reopen preserve pending tracking and duplicate-send protection in the mounted workspace; late POST completion, owner cleanup, and session loss pass. No cancellation or reload-persistence guarantee is introduced.
- [ ] The image's required states, keyboard behavior, live announcements, safe source labels, and 18-locale messages are verified. Manual Save, saved-revision Share, command policy, and API/security contracts remain unchanged.
- [ ] All applicable Web/document gates pass; external captures and a concise device-validation handoff are prepared. No image binary, credential, location payload log, unrelated change, or checked-but-unverified task is included.

## Risks and external handoff

- API result recovery is limited by latest-command visibility. An unmatched result remains unverified; do not work around it by sending the command again.
- Device owner: real Android execution, ACK timing, replacement behavior, and Stop timing require a separately approved physical-device check on a confirmed target. The agent can prepare synthetic evidence and the test procedure, but cannot claim real-device success from it. Do not release these fixes with an unsupported cancellation or exactly-once-delivery claim.
- Product reviewer: compare the four-state proposal with the implemented captures after agent checks pass. Visual preference is separate from verified request/state behavior; the temporary generated image is not release evidence.

## Review evidence and validation

Local evidence directory: `/private/tmp/kestrel-action-state-review.gRbyqn/`. `action-findings.json` contains all three confirmed reproductions. `actual-share-*.png` and `actual-command-*.png` are actual-UI captures; `proposed-action-states.png` is generated. `browser.mjs`, `fixtures.js`, and `review-actions.mjs` retain the local reproduction harness. The source references, steps, and image contract above remain usable if these temporary files are removed.

The review used synthetic API timing and responses, not a real service outage or device execution. A2 was confirmed with the same fixture command ID changing from QUEUED to APPLIED. A3 was confirmed with one command still QUEUED after reopening; no duplicate command was sent during that check. The review found existing defects, not passing implementation acceptance cases.

### Documentation PR checks

The unchanged application baseline passed `just web-check`, `just web-lint`, `just web-test` (209 tests), `just web-typecheck`, `just web-build`, and `just i18n-check` (18 locales). Local checks used Node.js 26.10.0, not the CI Node.js 22 runtime. Web check/lint retained 43 existing warnings and one Biome schema-version notice; no suppression or source fix was added.

Document hooks and `git diff --check` passed. Local-link/source-range checks passed and confirmed that all 13 implementation tasks and completion checks remain open. One unchanged plan-index link to `2026-10-22_personal-ai-provider-settings-plan.md` is already broken and remains out of scope. Independent review found no material issues in this plan. These documentation checks do not establish implementation or real-device readiness.
