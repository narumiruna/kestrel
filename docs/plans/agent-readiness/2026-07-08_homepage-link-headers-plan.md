## Goal

Add RFC 8288 `Link` response headers to the homepage so agents can discover useful Kestrel resources such as the API catalog, API docs, service description, sitemap, and agent metadata.

## Context

- `web/app/page.tsx` redirects `/` to `/login`, so header behavior must be verified on the redirect response and on `/login` if agents follow redirects.
- Candidate resources include `/.well-known/api-catalog`, `/docs/remote-control-api`, `/sitemap.xml`, `/.well-known/agent-skills/index.json`, and `/.well-known/mcp/server-card.json` once those plans land.
- References: RFC 8288, RFC 9727 section 3, and `https://isitagentready.com/.well-known/agent-skills/link-headers/SKILL.md`.

## Unknowns

- Which discovery resources will be implemented in the same release versus later.
- Whether the production reverse proxy preserves multiple `Link` header values.

## Plan

- [ ] Select the homepage `Link` targets and relations, preferring registered relations such as `service-desc`, `service-doc`, and `status` plus documented extension relations only when needed; verify the selection in code review against IANA/RFC references.
- [ ] Implement headers in `web/next.config.ts` via `headers()` or in Next middleware if redirect responses do not receive config headers; verify locally with `curl -I http://127.0.0.1:3301/`.
- [ ] Include Link headers on `/login` if agents commonly follow the homepage redirect; verify with `curl -I http://127.0.0.1:3301/login`.
- [ ] Add regression coverage with a lightweight header test or documented curl check in web validation; verify `cd web && npm run build` still passes.
- [ ] Deploy and verify `curl -I "$SITE_ORIGIN/"` shows the expected `Link` header values without being stripped or combined incorrectly by the proxy/CDN.

## Risks

- Advertising resources before they exist creates broken discovery paths.
- Incorrect relation types can make automated discovery ambiguous.

## Rollback / Recovery

- Remove the header configuration and redeploy; verify `curl -I "$SITE_ORIGIN/"` no longer contains the advertised links.

## Completion Checklist

- [ ] Homepage responses include RFC 8288-formatted `Link` headers, verified by production `curl -I "$SITE_ORIGIN/"` output.
- [ ] Every advertised target returns the expected status and content type, verified by `curl -i` for each target.
- [ ] Header behavior on the `/` redirect and `/login` page is documented by local or production curl evidence.
