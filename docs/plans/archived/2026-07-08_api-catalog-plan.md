## Goal

Publish `/.well-known/api-catalog` as `application/linkset+json` with conservative RFC 9727/RFC 9264 linkset entries that help agents discover Kestrel API documentation and status resources that actually exist.

## Context

- Kestrel has a NestJS backend proxied by the Next.js web app at `/api/backend/*`.
- Current API docs exist in `docs/remote-control-api.md`; this implementation exposes a copy at `/docs/remote-control-api.md`.
- No OpenAPI or OAuth/OIDC metadata exists yet, so the catalog intentionally does not advertise `service-desc`, OAuth, or OpenAPI links.
- References: RFC 9727, RFC 9264, and `https://isitagentready.com/.well-known/agent-skills/api-catalog/SKILL.md`.

## Plan

- [x] Inventory backend endpoints and classify public, authenticated, and admin-only API surfaces; verified by reviewing controller files under `backend/src/**/**.controller.ts` and using `docs/remote-control-api.md` as the exposed service documentation.
- [x] Choose an OpenAPI strategy; verified as not applicable for this phase because the active goal requires a conservative catalog and no OpenAPI document exists to advertise.
- [x] Add or expose a health/status endpoint suitable for `rel="status"`; verified by `web/app/status/route.ts` and local production-mode `curl -i http://127.0.0.1:3411/status` returning `200` JSON.
- [x] Implement `/.well-known/api-catalog` in the web app as a route handler returning `Content-Type: application/linkset+json` and a top-level `linkset` array; verified with local production-mode `curl -i http://127.0.0.1:3411/.well-known/api-catalog`.
- [x] Include link relations for real resources only; verified the JSON includes `service-doc` and `status`, omits `service-desc`, and Python assertions confirm every advertised link target resolves locally.
- [x] Reference the API catalog from homepage `Link` headers and allow it in `robots.txt`; verified with local production-mode `curl -I http://127.0.0.1:3411/` and `curl -i http://127.0.0.1:3411/robots.txt`.
- [x] Deploy the API catalog and homepage discovery headers through the production path; verified by Deploy workflow run 28922324552 on `main` completed successfully for `14115d9` (https://github.com/narumiruna/kestrel/actions/runs/28922324552); no production `SITE_ORIGIN` is documented in the repository, so external curl verification is not reproducible from repo state.

## Risks

- Publishing stale or incomplete OpenAPI metadata can mislead agents into unsafe calls.
- Exposing authenticated endpoint structure is acceptable only if it does not disclose sensitive implementation details.

## Rollback / Recovery

- Remove the API catalog route/header and redeploy; verify the well-known endpoint returns `404` or the prior behavior and homepage no longer advertises it.

## Completion Checklist

- [x] `/.well-known/api-catalog` returns `200` with `Content-Type: application/linkset+json`, verified by local production-mode `curl -i http://127.0.0.1:3411/.well-known/api-catalog`.
- [x] The response contains a valid `linkset` array with only real `service-doc` and `status` relations, verified by Python JSON assertions and manual review; `service-desc` is intentionally absent because no OpenAPI exists.
- [x] The advertised documentation and status URLs resolve, verified by local production-mode `curl -i` for `/docs/remote-control-api.md` and `/status`.
- [x] Production deployment includes `/.well-known/api-catalog`; verified by Deploy workflow run 28922324552 on `main` completed successfully for `14115d9` (https://github.com/narumiruna/kestrel/actions/runs/28922324552); no production `SITE_ORIGIN` is documented in the repository, so external curl verification is not reproducible from repo state.
