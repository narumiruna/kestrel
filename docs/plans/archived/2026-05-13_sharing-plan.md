# Sharing plan

## Goal

Let a route owner publish a public latest-route link from the web console, let unauthenticated visitors view that route, and let signed-in users copy the visible route snapshot into their own library.

## Context

The product MVP is mostly complete except route sharing. Backend already has `Route`, immutable `RouteRevision`, `LibraryItem`, owner-scoped auth, and soft-delete semantics. Web already has authenticated route editing. Android does not need new behavior for the first sharing slice; copied routes should later sync like any other owned route.

## Non-Goals

- Do not implement pinned revision sharing in the first slice; only reserve schema/API room for it.
- Do not implement collaborative editing or permission roles beyond public read.
- Do not expose private owner data on the public route page.

## Plan

- [x] Add a `ShareLink` Prisma model with owner id, route id, optional route revision id, token, permission, disabled/expires timestamps, and created timestamp.
- [x] Add a migration and model constraints so one active latest-link per owner/route is easy to query or enforce.
- [x] Implement backend API for authenticated users to create, fetch, disable, and re-enable a route's latest public share link.
- [x] Implement public API to resolve a share token and return a sanitized latest route revision snapshot.
- [x] Implement authenticated copy API that copies the currently visible public route revision snapshot into the caller's `Route`, `RouteRevision`, and `LibraryItem` rows.
- [x] Emit sync events for copied routes so Android sees the copied route on next sync.
- [x] Add backend tests for owner authorization, disabled/expired links, public read sanitization, and copy snapshot semantics.
- [x] Add web route UI controls to create/copy/disable the public link and copy its URL.
- [x] Add a public route page that renders route name, metadata, waypoints/map preview, and a signed-in copy action.
- [x] Update product docs and todo checklists after the sharing slice merges.

## Risks

- Public route pages can leak owner metadata if DTOs reuse authenticated route payloads without sanitization.
- Latest-link semantics can surprise users if the route changes after sharing; UI copy should explain it copies the currently visible latest revision.
- Copying a public route must create a new owned snapshot, not alias the original route/revision.

## Validation

- 2026-05-13 backend validation in repo workspace:
  - `cd backend && npm ci` ✅
  - `cd backend && npm run prisma:generate` ✅
  - `cd backend && npm run lint` ✅
  - `cd backend && npm test -- --runInBand` ✅ (`src/sharing/sharing.service.spec.ts` included; 8 suites / 38 tests pass)
  - `cd backend && npm run build` ✅ after moving the stale root-owned `backend/dist` aside to `backend/dist.root-owned-backup` and rebuilding into a new user-owned `dist/`.
  - Dev DB migration validation ✅: started `postgres` via `docker.exe compose --env-file <tmp> up -d postgres`, waited for `pg_isready -h localhost -p 15432 -d kestrel_cloud -U kestrel`, then ran `DATABASE_URL='postgresql://kestrel:kestrel@localhost:15432/kestrel_cloud?schema=public' npm run prisma:migrate:deploy`. Verified `_prisma_migrations` contains `20260513110000_sharing_links`. Production deploy path is already documented in `compose.yaml` (`backend` service command runs `npx prisma migrate deploy` before `npm run start:dev`) and in `backend/package.json` via `npm run prisma:migrate:deploy`.
- 2026-05-13 web validation in repo workspace:
  - `cd web && npm run lint` ✅
  - `cd web && npm run typecheck` ✅
  - `cd web && npm run build` ✅
- 2026-05-13 browser smoke in local dev stack (`docker.exe compose` postgres/backend/web + Chrome DevTools session):
  - Created two test users through auth API bootstrap (`smoke-owner-193746`, `smoke-copier-193746`) so the browser run could focus on the sharing UX rather than TOTP setup screens.
  - Logged in as the owner on `/login` using a recovery code, created route `Smoke share route 193746` from the dashboard, and created a latest share link from the route editor.
  - Logged out, opened the public URL `http://127.0.0.1:3301/share/Y7TEv1MZAfNlOh9OsARLP6vq`, and verified the route renders without login, shows the expected metadata/map preview, and does not expose the owner username in page text.
  - Followed the public page sign-in path with the copier account, navigated back to the public page after the login redirect to `/dashboard`, clicked `Copy to my library`, and verified the success banner plus the copied route appearing in the copier dashboard route list.
- 2026-05-13 sharing follow-up validation:
  - `docs/plans/archived/2026-05-13_sharing-followups-plan.md` records the post-PR fixes for copy-by-visible-revision and idempotent share-link create, including command validation plus a local dev-stack smoke where the owner updated a route after the visitor loaded it, the copier still cloned the originally viewed snapshot, concurrent share-link create requests returned the same active link, and the public page returned HTTP `200`.
- Remaining non-blocking follow-up:
  - Android `Sync now` smoke after copying a shared route has been moved to `docs/plans/2026-05-10_engineering-backlog-plan.md` because the sharing slice already emits standard `ROUTE` + `LIBRARY_ITEM` sync events and Android cloud sync behavior is tracked separately there.

## Completion Checklist

- [x] Prisma migration applies cleanly on a dev database and production deploy migration path is documented. _Verified on 2026-05-13 by starting `postgres` via `docker.exe compose`, running `DATABASE_URL='postgresql://kestrel:kestrel@localhost:15432/kestrel_cloud?schema=public' npm run prisma:migrate:deploy`, and querying `_prisma_migrations` to confirm `20260513110000_sharing_links`. Production deploy path is documented by `compose.yaml` and `backend/package.json` using `prisma migrate deploy`._
- [x] Backend sharing tests pass and cover disabled/expired/public/copy cases. _Verified on 2026-05-13 by `cd backend && npm test -- --runInBand`; `src/sharing/sharing.service.spec.ts` covers owner authorization, disabled/expired link rejection, public payload sanitization, and copy snapshot semantics._
- [x] Web route page can create and disable a latest share link. _Implemented in `web/app/dashboard/page.tsx` with backend endpoints under `backend/src/sharing/`, and the web app passes `npm run lint`, `npm run typecheck`, and `npm run build` on 2026-05-13._
- [x] Public route URL works without login and does not expose private owner fields. _Implemented via `GET /shares/:token` + `web/app/share/[token]/page.tsx`; service tests assert disabled/expired rejection and sanitized public payloads without owner metadata._
- [x] Signed-in user can copy a shared route and see it in their own library. _Verified on 2026-05-13 by a browser smoke run: owner account created `Smoke share route 193746`, public page rendered while logged out, copier account signed in and used `Copy to my library`, and the copied route then appeared in the copier dashboard route list._
- [x] Android-specific post-copy `Sync now` verification is tracked separately in `docs/plans/2026-05-10_engineering-backlog-plan.md`, so this sharing-slice plan can close on shipped backend/web behavior and recorded follow-up validation evidence.
