## Goal

Publish `/.well-known/api-catalog` as `application/linkset+json` with RFC 9727 linkset entries that help agents discover Kestrel APIs, service descriptions, docs, and status endpoints.

## Context

- Kestrel has a NestJS backend proxied by the Next.js web app at `/api/backend/*`.
- Current API docs exist in `docs/remote-control-api.md`, but no OpenAPI service description is visible in the web root.
- References: RFC 9727, RFC 9264, and `https://isitagentready.com/.well-known/agent-skills/api-catalog/SKILL.md`.

## Unknowns

- Whether the API catalog should describe only public endpoints or also authenticated endpoints.
- Whether to generate OpenAPI from NestJS decorators or maintain a static OpenAPI file.

## Plan

- [ ] Inventory backend endpoints and classify public, authenticated, and admin-only API surfaces; verify with controller files under `backend/src/**/**.controller.ts` and `docs/remote-control-api.md`.
- [ ] Choose an OpenAPI strategy: generated with NestJS Swagger or committed static `openapi.json`; verify the choice with a working `curl` or file output path for `service-desc`.
- [ ] Add or expose a health/status endpoint suitable for `rel="status"`; verify with `curl -i http://127.0.0.1:3300/<status-path>` or the proxied `/api/backend/<status-path>`.
- [ ] Implement `/.well-known/api-catalog` in the web app as a route handler or static file returning `Content-Type: application/linkset+json` and a top-level `linkset` array; verify with `curl -i http://127.0.0.1:3301/.well-known/api-catalog`.
- [ ] Include link relations for `service-desc`, `service-doc`, and `status` with absolute or correctly relative URLs; verify the JSON with `jq '.linkset'` and manual review against RFC 9727 examples.
- [ ] Reference the API catalog from homepage `Link` headers and allow it in `robots.txt`; verify with `curl -I "$SITE_ORIGIN/"` and `curl -i "$SITE_ORIGIN/.well-known/api-catalog"` after deploy.

## Risks

- Publishing stale or incomplete OpenAPI metadata can mislead agents into unsafe calls.
- Exposing authenticated endpoint structure is acceptable only if it does not disclose sensitive implementation details.

## Rollback / Recovery

- Remove the API catalog route/header and redeploy; verify the well-known endpoint returns `404` or the prior behavior and homepage no longer advertises it.

## Completion Checklist

- [ ] `/.well-known/api-catalog` returns `200` with `Content-Type: application/linkset+json`, verified by production `curl -i` output.
- [ ] The response contains a valid `linkset` array with `service-desc`, `service-doc`, and `status` relations, verified by `jq` and review against RFC 9727.
- [ ] The advertised service description, documentation, and status URLs all resolve, verified by `curl -i` for each link.
