## Goal

Publish `/robots.txt` at the Kestrel site root with valid RFC 9309 crawl records, explicit `User-agent` directives, path allow/disallow rules, and a `200` plain-text response.

## Context

- The web site is the Next.js app in `web/`; static root files can live in `web/public/`.
- This plan should be coordinated with the sitemap, AI-crawler rules, and Content Signals plans so there is one authoritative `robots.txt`.
- References: RFC 9309 and `https://isitagentready.com/.well-known/agent-skills/robots-txt/SKILL.md`.

## Unknowns

- The final production origin and whether any reverse proxy/CDN overrides `/robots.txt`.
- The intended crawl policy for public share pages versus authenticated dashboard/API paths.

## Plan

- [ ] Inventory current root/static routes for conflicting robots handling; verify with `find web/app web/public -maxdepth 4 -type f | sort` and confirm no other `robots.txt` route exists.
- [ ] Define a crawl policy matrix for `/`, `/login`, `/share/*`, `/dashboard/*`, `/api/backend/*`, and `/.well-known/*`; verify with explicit user acceptance or a committed policy note in this file before implementation.
- [ ] Create `web/public/robots.txt` with at least `User-agent: *`, explicit `Allow`/`Disallow` lines for key paths, and no HTML; verify the file contents with `file web/public/robots.txt` and `grep -n '^User-agent:' web/public/robots.txt`.
- [ ] Build and serve the web app locally; verify with `cd web && npm run build` and `curl -i http://127.0.0.1:3301/robots.txt` after `npm run start` returns `200` and `Content-Type: text/plain`.
- [ ] Deploy through the production path; verify with `curl -i "$SITE_ORIGIN/robots.txt"` returning `200`, `Content-Type: text/plain`, and the committed crawl records.

## Risks

- A permissive default can expose private dashboard URLs to indexing even when auth blocks content.
- Multiple plans touching `robots.txt` can overwrite one another unless implemented as one consolidated file.

## Rollback / Recovery

- Revert the `robots.txt` change or replace it with `User-agent: *` plus conservative `Disallow` rules; verify rollback with `curl -i "$SITE_ORIGIN/robots.txt"`.

## Completion Checklist

- [ ] `/robots.txt` is valid plain text with at least one `User-agent` record, verified by `curl -i "$SITE_ORIGIN/robots.txt"` and `grep -n '^User-agent:' web/public/robots.txt`.
- [ ] Crawl rules cover public, private, API, and well-known paths, verified by the committed `web/public/robots.txt` policy matrix.
- [ ] The production endpoint returns `200`, verified by saved `curl -i "$SITE_ORIGIN/robots.txt"` output.
