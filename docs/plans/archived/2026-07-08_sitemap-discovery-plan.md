## Goal

Publish `/sitemap.xml` with canonical public URLs, keep it updated when public routes change, and reference it from `/robots.txt`.

## Context

- The web site is the Next.js app in `web/` with public pages such as `/login`, a public API doc file, and dynamic share pages under `/share/[token]`.
- The sitemap intentionally excludes authenticated dashboard/API routes and tokenized share URLs.
- References: Sitemap protocol and `https://isitagentready.com/.well-known/agent-skills/sitemap/SKILL.md`.

## Unknowns

- Resolved: `KESTREL_SITE_ORIGIN` remains optional and route handlers derive origin from request/forwarded headers; no production origin is documented for external curl verification.

## Plan

- [x] Inventory public routes in `web/app` and classify each as indexable or non-indexable; verified by `CANONICAL_PUBLIC_PATHS` listing only `/login` and `/docs/remote-control-api.md`, while local assertions reject `/share/`, `/dashboard/`, and `/api/backend/` in sitemap XML.
- [x] Add a canonical origin configuration for sitemap generation; verified by `KESTREL_SITE_ORIGIN` in `web/.env.example` and request/forwarded-header fallback in `web/lib/agentDiscovery.ts`.
- [x] Implement a generated `/sitemap.xml` listing canonical public URLs with `lastmod`; verified with local production-mode `curl -i http://127.0.0.1:3411/sitemap.xml` returning XML.
- [x] Update `/robots.txt` to include `Sitemap: $SITE_ORIGIN/sitemap.xml`; verified by local production-mode curl and Python assertion for `Sitemap: http://127.0.0.1:3411/sitemap.xml`.
- [x] Keep the sitemap route tied to the canonical path list used by web validation; verified by `cd web && npm run build`, `npm run typecheck`, `just web-check`, and local curl assertions.
- [x] Deploy `/sitemap.xml` through the production path; verified by Deploy workflow run 28922324552 on `main` completed successfully for `14115d9` (https://github.com/narumiruna/kestrel/actions/runs/28922324552); no production `SITE_ORIGIN` is documented in the repository, so external curl verification is not reproducible from repo state.

## Risks

- Listing share-token URLs can make private-by-link content discoverable.
- Missing canonical origin configuration can produce localhost URLs in production if proxy headers are not forwarded.

## Rollback / Recovery

- Remove the sitemap reference from `robots.txt` and revert the sitemap route; verify production no longer advertises stale sitemap data.

## Completion Checklist

- [x] `/sitemap.xml` lists only approved canonical public URLs, verified by generated XML containing `/login` and `/docs/remote-control-api.md` and excluding `/share/`, `/dashboard/`, and `/api/backend/`.
- [x] `/robots.txt` references the sitemap, verified by local production-mode curl output.
- [x] The sitemap stays current with the route implementation, verified by central `CANONICAL_PUBLIC_PATHS` and web build/typecheck/check commands.
- [x] Production deployment includes `/sitemap.xml`; verified by Deploy workflow run 28922324552 on `main` completed successfully for `14115d9` (https://github.com/narumiruna/kestrel/actions/runs/28922324552); no production `SITE_ORIGIN` is documented in the repository, so external curl verification is not reproducible from repo state.
