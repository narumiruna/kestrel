## Goal

Add RFC 8288 `Link` response headers to the homepage so agents can discover useful Kestrel resources such as the API catalog and sitemap.

## Context

- `web/app/page.tsx` redirects `/` to `/login`, so header behavior is verified on the redirect response and on `/login` for agents that follow redirects.
- Implemented targets are limited to working first-wave resources: `/.well-known/api-catalog` and `/sitemap.xml`.
- References: RFC 8288, RFC 9727 section 3, and `https://isitagentready.com/.well-known/agent-skills/link-headers/SKILL.md`.

## Unknowns

- Whether the production reverse proxy preserves the `Link` header until deploy verification is performed.

## Plan

- [x] Select the homepage `Link` targets and relations, preferring implemented discovery resources only; verified by `AGENT_DISCOVERY_LINK_HEADER` containing `rel="api-catalog"` for `/.well-known/api-catalog` and `rel="sitemap"` for `/sitemap.xml`.
- [x] Implement headers in `web/next.config.ts` via `headers()`; verified locally with `curl -I http://127.0.0.1:3411/` returning the `Link` header on the `307` homepage redirect.
- [x] Include Link headers on `/login` for agents that follow the homepage redirect; verified with `curl -I http://127.0.0.1:3411/login` returning the same `Link` header.
- [x] Add regression coverage with documented curl checks in web validation; verified by local production-mode curl output plus `cd web && npm run build`.
- [ ] Deploy and verify `curl -I "$SITE_ORIGIN/"` shows the expected `Link` header values without being stripped or combined incorrectly by the proxy/CDN.

## Risks

- Advertising resources before they exist creates broken discovery paths.
- Incorrect relation types can make automated discovery ambiguous.

## Rollback / Recovery

- Remove the header configuration and redeploy; verify `curl -I "$SITE_ORIGIN/"` no longer contains the advertised links.

## Completion Checklist

- [x] Homepage responses include RFC 8288-formatted `Link` headers, verified by local production-mode `curl -I http://127.0.0.1:3411/` output.
- [x] Every advertised target returns the expected status and content type, verified by local production-mode `curl -i` for `/.well-known/api-catalog` and `/sitemap.xml`.
- [x] Header behavior on the `/` redirect and `/login` page is documented by local curl evidence saved under `/tmp/kestrel-home-headers.txt` and `/tmp/kestrel-login-headers.txt` during implementation.
- [ ] Production homepage responses include the expected `Link` headers after deploy, verified by `curl -I "$SITE_ORIGIN/"`.
