## Goal

Publish `/sitemap.xml` with canonical public URLs, keep it updated when public routes change, and reference it from `/robots.txt`.

## Context

- The web site is the Next.js app in `web/` with public pages such as `/login`, a public API doc file, and dynamic share pages under `/share/[token]`.
- The sitemap intentionally excludes authenticated dashboard/API routes and tokenized share URLs.
- References: Sitemap protocol and `https://isitagentready.com/.well-known/agent-skills/sitemap/SKILL.md`.

## Unknowns

- The final production origin can be supplied with `KESTREL_SITE_ORIGIN`; otherwise route handlers derive it from request or forwarded headers.

## Plan

- [x] Inventory public routes in `web/app` and classify each as indexable or non-indexable; verified by `CANONICAL_PUBLIC_PATHS` listing only `/login` and `/docs/remote-control-api.md`, while local assertions reject `/share/`, `/dashboard/`, and `/api/backend/` in sitemap XML.
- [x] Add a canonical origin configuration for sitemap generation; verified by `KESTREL_SITE_ORIGIN` in `web/.env.example` and request/forwarded-header fallback in `web/lib/agentDiscovery.ts`.
- [x] Implement a generated `/sitemap.xml` listing canonical public URLs with `lastmod`; verified with local production-mode `curl -i http://127.0.0.1:3411/sitemap.xml` returning XML.
- [x] Update `/robots.txt` to include `Sitemap: $SITE_ORIGIN/sitemap.xml`; verified by local production-mode curl and Python assertion for `Sitemap: http://127.0.0.1:3411/sitemap.xml`.
- [x] Keep the sitemap route tied to the canonical path list used by web validation; verified by `cd web && npm run build`, `npm run typecheck`, `just web-check`, and local curl assertions.
- [ ] Deploy and verify `curl -i "$SITE_ORIGIN/sitemap.xml"` returns `200`, `Content-Type` XML, absolute canonical URLs, and no authenticated API/dashboard URLs.

## Risks

- Listing share-token URLs can make private-by-link content discoverable.
- Missing canonical origin configuration can produce localhost URLs in production if proxy headers are not forwarded.

## Rollback / Recovery

- Remove the sitemap reference from `robots.txt` and revert the sitemap route; verify production no longer advertises stale sitemap data.

## Completion Checklist

- [x] `/sitemap.xml` lists only approved canonical public URLs, verified by generated XML containing `/login` and `/docs/remote-control-api.md` and excluding `/share/`, `/dashboard/`, and `/api/backend/`.
- [x] `/robots.txt` references the sitemap, verified by local production-mode curl output.
- [x] The sitemap stays current with the route implementation, verified by central `CANONICAL_PUBLIC_PATHS` and web build/typecheck/check commands.
- [ ] Production `/sitemap.xml` returns the expected XML after deploy, verified by `curl -i "$SITE_ORIGIN/sitemap.xml"`.
