## Goal

Add RFC 8288 `Link` response headers to the homepage so agents can discover useful Kestrel resources such as the API catalog and sitemap.

## Context

- `web/app/page.tsx` redirects `/` to `/login`, so header behavior is verified on the redirect response and on `/login` for agents that follow redirects.
- Implemented targets are limited to working first-wave resources: `/.well-known/api-catalog` and `/sitemap.xml`.
- References: RFC 8288, RFC 9727 section 3, and `https://isitagentready.com/.well-known/agent-skills/link-headers/SKILL.md`.

## Unknowns

- Resolved: deploy completed successfully; no production origin is documented for external proxy/header curl verification from repo state.

## Plan

- [x] Select the homepage `Link` targets and relations, preferring implemented discovery resources only; verified by `AGENT_DISCOVERY_LINK_HEADER` containing `rel="api-catalog"` for `/.well-known/api-catalog` and `rel="sitemap"` for `/sitemap.xml`.
- [x] Implement headers in `web/next.config.ts` via `headers()`; verified locally with `curl -I http://127.0.0.1:3411/` returning the `Link` header on the `307` homepage redirect.
- [x] Include Link headers on `/login` for agents that follow the homepage redirect; verified with `curl -I http://127.0.0.1:3411/login` returning the same `Link` header.
- [x] Add regression coverage with documented curl checks in web validation; verified by local production-mode curl output plus `cd web && npm run build`.
- [x] Deploy homepage `Link` headers through the production path; verified by Deploy workflow run 28922324552 on `main` completed successfully for `14115d9` (https://github.com/narumiruna/kestrel/actions/runs/28922324552); no production `SITE_ORIGIN` is documented in the repository, so external curl verification is not reproducible from repo state.

## Risks

- Advertising resources before they exist creates broken discovery paths.
- Incorrect relation types can make automated discovery ambiguous.

## Rollback / Recovery

- Remove the header configuration and redeploy; verify `curl -I "$SITE_ORIGIN/"` no longer contains the advertised links.

## Completion Checklist

- [x] Homepage responses include RFC 8288-formatted `Link` headers, verified by local production-mode `curl -I http://127.0.0.1:3411/` output.
- [x] Every advertised target returns the expected status and content type, verified by local production-mode `curl -i` for `/.well-known/api-catalog` and `/sitemap.xml`.
- [x] Header behavior on the `/` redirect and `/login` page is documented by local curl evidence saved under `/tmp/kestrel-home-headers.txt` and `/tmp/kestrel-login-headers.txt` during implementation.
- [x] Production deployment includes homepage `Link` headers; verified by Deploy workflow run 28922324552 on `main` completed successfully for `14115d9` (https://github.com/narumiruna/kestrel/actions/runs/28922324552); no production `SITE_ORIGIN` is documented in the repository, so external curl verification is not reproducible from repo state.
