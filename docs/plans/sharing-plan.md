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

- [ ] Add a `ShareLink` Prisma model with owner id, route id, optional route revision id, token, permission, disabled/expires timestamps, and created timestamp.
- [ ] Add a migration and model constraints so one active latest-link per owner/route is easy to query or enforce.
- [ ] Implement backend API for authenticated users to create, fetch, disable, and re-enable a route's latest public share link.
- [ ] Implement public API to resolve a share token and return a sanitized latest route revision snapshot.
- [ ] Implement authenticated copy API that copies the currently visible public route revision snapshot into the caller's `Route`, `RouteRevision`, and `LibraryItem` rows.
- [ ] Emit sync events for copied routes so Android sees the copied route on next sync.
- [ ] Add backend tests for owner authorization, disabled/expired links, public read sanitization, and copy snapshot semantics.
- [ ] Add web route UI controls to create/copy/disable the public link and copy its URL.
- [ ] Add a public route page that renders route name, metadata, waypoints/map preview, and a signed-in copy action.
- [ ] Update product docs and todo checklists after the sharing slice merges.

## Risks

- Public route pages can leak owner metadata if DTOs reuse authenticated route payloads without sanitization.
- Latest-link semantics can surprise users if the route changes after sharing; UI copy should explain it copies the currently visible latest revision.
- Copying a public route must create a new owned snapshot, not alias the original route/revision.

## Completion Checklist

- [ ] Prisma migration applies cleanly on a dev database and production deploy migration path is documented.
- [ ] Backend sharing tests pass and cover disabled/expired/public/copy cases.
- [ ] Web route page can create and disable a latest share link.
- [ ] Public route URL works without login and does not expose private owner fields.
- [ ] Signed-in user can copy a shared route and see it in their own library.
- [ ] Android sync receives copied routes as normal owned routes after `Sync now`.
