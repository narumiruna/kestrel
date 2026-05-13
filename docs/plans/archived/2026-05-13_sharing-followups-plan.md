# Sharing follow-ups plan

## Goal

Close the two correctness gaps found in PR #64 so share-link creation stays idempotent under concurrent requests, and `Copy to my library` always copies the exact route snapshot the public page is showing.

## Context

The initial sharing slice landed in `docs/plans/archived/2026-05-13_sharing-plan.md`, but review found two follow-up fixes:

1. `POST /shares/:token/copy` re-resolves the latest revision at copy time, so the copied route can differ from the snapshot the visitor loaded.
2. `POST /routes/:routeId/share-link` does a read-then-create flow, so concurrent requests can race into the partial unique index and return a server error instead of reusing the same active link.

These fixes should stay within the existing sharing scope: latest-route public links, signed-in copy, and current Prisma schema unless implementation proves otherwise.

## Non-Goals

- Do not add pinned-revision sharing UX or new share permissions in this follow-up.
- Do not redesign the broader sharing model beyond what is required to make latest-link copy semantics and create semantics correct.
- Do not expand Android behavior beyond verifying that copied routes still sync normally if implementation touches sync-visible payloads.

## Assumptions

- The public share page may return enough revision identity for the client to request a copy of the exact visible snapshot without adding a new table or migration.
- Returning an existing active share link on duplicate create attempts is the desired API behavior.

## Plan

- [x] Update the sharing contract so the public share payload includes stable identity for the visible revision, and require the copy flow to submit that identity back to the backend; verified by `backend/src/sharing/sharing.service.ts`, `backend/src/sharing/sharing.controller.ts`, `web/lib/api.ts`, and `web/app/share/[token]/page.tsx` now passing `routeRevisionId` through the public copy flow.
- [x] Change backend copy handling to validate the requested visible revision belongs to the resolved share link and clone that fixed snapshot, not a newly re-read latest revision; verified by `backend/src/sharing/sharing.service.spec.ts` coverage for "page loaded on rev N, owner publishes rev N+1, copy still clones rev N" and mismatched-revision rejection.
- [x] Make latest-link creation idempotent under concurrent requests by handling the unique-constraint race and returning the existing active link instead of surfacing a 500; verified by the new duplicate-create regression test in `backend/src/sharing/sharing.service.spec.ts`.
- [x] Refresh or extend API and UI error handling so stale or mismatched revision-copy requests fail with an intentional client-visible error instead of an ambiguous server failure; verified by `backend/src/sharing/sharing.validation.ts`, `backend/src/sharing/sharing.service.ts`, `backend/src/sharing/sharing.service.spec.ts`, and `web/lib/api.ts`.
- [x] Re-run focused validation for the sharing slice after the fixes land; verified by the command checks below plus a 2026-05-13 local dev-stack smoke that created fresh owner/copier accounts, copied a previously viewed snapshot after the owner published a newer revision, and confirmed concurrent share-link create requests reused one active link.
- [x] Update planning/docs status once the fixes merge; verified by this plan update and the `docs/plans/README.md` entry for `2026-05-13_sharing-followups-plan.md`.

## Risks

- If the copy API accepts a revision identifier without checking that it matches the share link's visible snapshot rules, callers could probe unrelated revision ids.
- If the create endpoint catches all database errors too broadly, it could hide real failures behind a false "existing link" success path.
- If the web page stores a stale snapshot identifier incorrectly, retries after link disable/re-enable could show confusing UX unless the returned error is explicit.

## Validation

- 2026-05-13 command validation in repo workspace:
  - `cd backend && npm run prisma:generate` ✅
  - `cd backend && npm run test -- --runInBand sharing.service.spec.ts` ✅
  - `cd backend && npm run typecheck` ✅
  - `cd backend && npm run build` ✅
  - `cd web && npm run typecheck` ✅
  - `cd web && npm run build` ✅
- 2026-05-13 local dev-stack smoke (`docker compose up -d postgres backend web` + API/public-page checks):
  - Created fresh users `smoke-owner-205456-8652` and `smoke-copier-205456-8652` through `/auth/register` + `/auth/totp/setup` + `/auth/totp/verify` + `/auth/login`.
  - Created route A, published share token `C4SgIO4elRLKDpSP29C0O_Uo`, captured old visible revision `73bcdcfe-83eb-40b3-881c-9fcba57e0d96`, updated the owner route to a new latest revision `cfe7b734-2ff3-4d06-bfa5-2991abb7c7d3`, then copied using the old revision id and verified the copied route `def4403b-94ef-4011-a13a-2843aceb4b8c` kept the old snapshot's speed/mode (`24`, `LOOP`).
  - Created route B and fired two concurrent `POST /routes/:routeId/share-link` requests; both returned `201` with the same share token `ENf-d-w665f5rkx-KkWkiSZ0`, confirming idempotent reuse under the unique-index race.
  - Fetched `http://127.0.0.1:3301/share/C4SgIO4elRLKDpSP29C0O_Uo` and verified the public page returned HTTP `200`.

## Completion Checklist

- [x] Public copy uses an explicit visible-snapshot identity and is verified by backend tests plus `web/app/share/[token]/page.tsx` submitting `routeRevisionId`.
- [x] Copying after the owner updates the route still clones the originally viewed snapshot, verified by the automated backend regression test `copies the originally viewed snapshot even after the route gets a newer revision` in `backend/src/sharing/sharing.service.spec.ts`.
- [x] Concurrent create-share-link requests reuse one active link and are verified by the automated backend regression test `reuses the active share link when concurrent create hits the unique index` in `backend/src/sharing/sharing.service.spec.ts`.
- [x] Backend and web checks pass, verified by `cd backend && npm run test -- --runInBand sharing.service.spec.ts`, `cd backend && npm run typecheck`, `cd backend && npm run build`, `cd web && npm run typecheck`, and `cd web && npm run build`.
- [x] Manual smoke confirms both follow-up fixes, verified by the 2026-05-13 dev-stack run recorded in `## Validation`.
- [x] Plan/docs status reflects the follow-up work, verified by the updated `docs/plans/README.md` entry and completion notes in this plan.
