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
- Remaining validation gaps:
  - End-to-end browser smoke for create link → open public page → sign in → copy route has not yet been recorded.
  - Android `Sync now` against a copied shared route has not yet been smoke-verified.

## Completion Checklist

- [x] Prisma migration applies cleanly on a dev database and production deploy migration path is documented. _Verified on 2026-05-13 by starting `postgres` via `docker.exe compose`, running `DATABASE_URL='postgresql://kestrel:kestrel@localhost:15432/kestrel_cloud?schema=public' npm run prisma:migrate:deploy`, and querying `_prisma_migrations` to confirm `20260513110000_sharing_links`. Production deploy path is documented by `compose.yaml` and `backend/package.json` using `prisma migrate deploy`._
- [x] Backend sharing tests pass and cover disabled/expired/public/copy cases. _Verified on 2026-05-13 by `cd backend && npm test -- --runInBand`; `src/sharing/sharing.service.spec.ts` covers owner authorization, disabled/expired link rejection, public payload sanitization, and copy snapshot semantics._
- [x] Web route page can create and disable a latest share link. _Implemented in `web/app/dashboard/page.tsx` with backend endpoints under `backend/src/sharing/`, and the web app passes `npm run lint`, `npm run typecheck`, and `npm run build` on 2026-05-13._
- [x] Public route URL works without login and does not expose private owner fields. _Implemented via `GET /shares/:token` + `web/app/share/[token]/page.tsx`; service tests assert disabled/expired rejection and sanitized public payloads without owner metadata._
- [ ] Signed-in user can copy a shared route and see it in their own library. _Backend copy semantics are unit-tested and the web page exposes the action, but a full browser end-to-end verification is still unrecorded._
- [ ] Android sync receives copied routes as normal owned routes after `Sync now`. _Expected because copy emits `ROUTE` + `LIBRARY_ITEM` sync events, but Android smoke verification is still pending._
