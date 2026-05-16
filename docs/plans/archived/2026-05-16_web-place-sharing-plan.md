## Goal

Add web support for sharing saved places, matching the existing route share flow: place owners can create/disable/re-enable/copy/open a public link from the Places dashboard, visitors can view a public place page, and signed-in users can copy the shared place into their own library.

## Context

Existing sharing is route-only. `share_links` requires `route_id`, backend endpoints are under `/routes/:routeId/share-link`, and `/share/[token]` assumes every token resolves to a route snapshot.

## Architecture

- Make `share_links` polymorphic for latest route or place links by adding nullable `place_id` while keeping route fields for existing links.
- Public `/shares/:token` returns a discriminated snapshot (`kind: 'PLACE' | 'ROUTE'`) so the web share page can render either kind.
- Authenticated `/shares/:token/copy` creates the matching place or route plus a library item and sync events.

## Plan

- [x] Add a Prisma/schema migration for place share links without breaking existing route share links; verified with `cd backend && npm run prisma:generate`, `cd backend && npx prisma validate`, and `cd backend && npm run typecheck`.
- [x] Extend backend sharing endpoints/service/models/tests for place share create/get/update, public snapshot, and copy-to-library; verified with `cd backend && npm test -- --runInBand`.
- [x] Extend web API types, Places dashboard editor, and public share page to support place share links and copy flow; verified with `cd web && npm run typecheck` and `cd web && npm exec -- biome ci app/share/[token]/page.tsx components/PlaceMapPreview.tsx components/dashboard/PlaceEditor.tsx lib/api.ts README.md`.
- [x] Update web README scope text to mention place sharing; verified by `web/README.md` diff.

## Risks

- Migration must preserve existing route share links and the existing one-active-latest-route-link invariant.
- Public share response must not leak owner IDs or internal place IDs.

## Rollback / Recovery

- If migration fails before deploy, revert the schema and migration file before deployment.
- If runtime issues appear after deploy, disable the new UI calls while leaving existing route sharing data intact.

## Completion Checklist

- [x] Place owners can create, disable/re-enable, copy, and open place share URLs from the web Places dashboard, verified by `PlaceSharePanel` in `web/components/dashboard/PlaceEditor.tsx` and `SharingService` tests.
- [x] Public share page renders both route and place snapshots, verified by `SharedSnapshot` discriminated rendering in `web/app/share/[token]/page.tsx` and web typecheck.
- [x] Signed-in users can copy shared places to their library with sync events, verified by `copies a shared place into the caller library` in `backend/src/sharing/sharing.service.spec.ts`.
- [x] Existing route share behavior remains covered by `cd backend && npm test -- --runInBand` and `cd web && npm run typecheck`.
