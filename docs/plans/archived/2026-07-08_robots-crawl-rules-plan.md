## Goal

Publish `/robots.txt` at the Kestrel site root with valid RFC 9309 crawl records, explicit `User-agent` directives, path allow/disallow rules, and a `200` plain-text response.

## Context

- The web site is the Next.js app in `web/`.
- This plan is coordinated with the sitemap, AI-crawler rules, and Content Signals plans through the route handler at `web/app/robots.txt/route.ts`.
- References: RFC 9309 and `https://isitagentready.com/.well-known/agent-skills/robots-txt/SKILL.md`.

## Unknowns

- Resolved: no production `SITE_ORIGIN` is documented in the repository; deploy completion is verified by GitHub Actions, while external curl verification is not reproducible from repo state.

## Plan

- [x] Inventory current root/static routes for conflicting robots handling; verified with `find web/app web/public -maxdepth 4 -type f | sort` before adding the only `robots.txt` handler.
- [x] Define a crawl policy matrix for `/`, `/login`, `/share/*`, `/dashboard/*`, `/api/backend/*`, and `/.well-known/*`; verified by `web/app/robots.txt/route.ts` allowing public docs/well-known/status paths and disallowing dashboard, backend API, and share-token paths.
- [x] Create `/robots.txt` with at least `User-agent: *`, explicit `Allow`/`Disallow` lines for key paths, and no HTML; verified by local production-mode `curl -i http://127.0.0.1:3411/robots.txt` returning `Content-Type: text/plain; charset=utf-8`.
- [x] Build and serve the web app locally; verified with `cd web && npm run build` and local production-mode curl assertions against `http://127.0.0.1:3411/robots.txt`.
- [x] Deploy through the production path; verified by Deploy workflow run 28922324552 on `main` completed successfully for `14115d9` (https://github.com/narumiruna/kestrel/actions/runs/28922324552); no production `SITE_ORIGIN` is documented in the repository, so external curl verification is not reproducible from repo state.

## Risks

- A permissive default can expose private dashboard URLs to indexing even when auth blocks content.
- Multiple plans touching `robots.txt` can overwrite one another unless implemented as one consolidated route.

## Rollback / Recovery

- Revert the `robots.txt` route handler or replace it with `User-agent: *` plus conservative `Disallow` rules; verify rollback with `curl -i "$SITE_ORIGIN/robots.txt"`.

## Completion Checklist

- [x] `/robots.txt` is valid plain text with at least one `User-agent` record, verified by local production-mode `curl -i http://127.0.0.1:3411/robots.txt` and Python assertions for `User-agent: *`.
- [x] Crawl rules cover public, private, API, and well-known paths, verified by `web/app/robots.txt/route.ts` and local curl output containing prefix rules `Disallow: /dashboard`, `Disallow: /api/backend`, `Disallow: /share`, and `Allow: /.well-known/`.
- [x] Production deployment completed; verified by Deploy workflow run 28922324552 on `main` completed successfully for `14115d9` (https://github.com/narumiruna/kestrel/actions/runs/28922324552); no production `SITE_ORIGIN` is documented in the repository, so external curl verification is not reproducible from repo state.
