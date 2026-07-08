## Goal

Use a staged, low-risk agent-readiness roadmap for Kestrel so the project first fixes discovery hygiene, then adds useful agent metadata, and avoids publishing unsupported OAuth/MCP/WebMCP claims.

## Context

This is the entry plan for the individual agent-readiness plans. Active child plans live under `docs/plans/agent-readiness/`; completed child plans live under `docs/plans/archived/`. It prioritizes work by implementation cost, product value, and risk of falsely advertising unsupported capabilities.

## Non-Goals

- Do not implement OAuth/OIDC, MCP, WebMCP, or DNS-AID just to satisfy a scanner.
- Do not publish metadata that implies standards-compliant auth, MCP, or browser tool support before those capabilities exist.
- Do not index capability URLs such as `/share/[token]` unless there is an explicit product decision to make shared content discoverable.

## Plan

- [x] Implement the first-wave `robots.txt` bundle by combining `docs/plans/archived/2026-07-08_robots-crawl-rules-plan.md`, `docs/plans/archived/2026-07-08_ai-crawler-robots-rules-plan.md`, and `docs/plans/archived/2026-07-08_content-signals-robots-plan.md` into one coherent `/robots.txt`; verified with `npm run build` and local production-mode `curl -i http://127.0.0.1:3411/robots.txt` returning `200` plain text with wildcard, AI crawler, Content Signal, and sitemap rules.
- [x] Implement `docs/plans/archived/2026-07-08_sitemap-discovery-plan.md` with only approved canonical public URLs; verified `/sitemap.xml` returns `200` XML and excludes `/dashboard/*`, `/api/backend/*`, and tokenized `/share/[token]` URLs by local production-mode curl plus Python assertions.
- [x] Implement `docs/plans/archived/2026-07-08_api-catalog-plan.md` as a conservative catalog that advertises real docs/status resources only; verified `/.well-known/api-catalog` returns `application/linkset+json`, omits `service-desc` because no OpenAPI exists, and every advertised link resolves locally.
- [x] Implement `docs/plans/archived/2026-07-08_homepage-link-headers-plan.md` after the linked resources exist; verified `curl -I http://127.0.0.1:3411/` and `/login` advertise only working resources: `/sitemap.xml` and `/.well-known/api-catalog`.
- [ ] Reassess `docs/plans/agent-readiness/2026-07-08_agent-skills-index-plan.md` after API docs/catalog stabilize; verify with user acceptance before authoring Kestrel-specific skill documents.
- [ ] Reassess `docs/plans/agent-readiness/2026-07-08_markdown-negotiation-plan.md` only if Cloudflare or another low-maintenance edge feature is available, or if Kestrel adds public docs/content pages; verify with a documented go/no-go decision.
- [ ] Defer `docs/plans/agent-readiness/2026-07-08_dns-aid-discovery-plan.md` until the DNS provider, DNSSEC setup, and DNS-AID draft maturity justify the operational cost; verify with an explicit accepted follow-up decision before implementation.
- [ ] Defer `docs/plans/agent-readiness/2026-07-08_oauth-discovery-metadata-plan.md`, `docs/plans/agent-readiness/2026-07-08_oauth-protected-resource-metadata-plan.md`, and `docs/plans/agent-readiness/2026-07-08_auth-md-agent-registration-plan.md` until Kestrel has or intentionally adopts standards-compliant OAuth/OIDC and agent registration; verify no OAuth/Auth.md metadata is published as a placeholder.
- [ ] Defer `docs/plans/agent-readiness/2026-07-08_mcp-server-card-plan.md` and `docs/plans/agent-readiness/2026-07-08_webmcp-browser-tools-plan.md` until agent operation of Kestrel becomes an explicit product feature with permissions and confirmation UX; verify no MCP/WebMCP metadata is published before working tools exist.

## Risks

- Publishing placeholder metadata can cause agents to trust capabilities that do not exist.
- Making shared token URLs indexable can expose by-link content more broadly than intended.
- Too many independent discovery files can drift unless implemented in staged bundles with shared validation.

## Rollback / Recovery

- If a published discovery resource is wrong, remove its homepage `Link` header and well-known/static endpoint first, then redeploy; verify with production `curl` that agents no longer discover the stale resource.
- If crawler policy is wrong, update `robots.txt` as the single source of truth and verify production response after deploy.

## Completion Checklist

- [x] First-wave discovery hygiene is complete in the codebase, verified by `npm run build`, `npm run typecheck`, `just web-check`, `just web-lint`, and local production-mode `curl` evidence for `/robots.txt`, `/sitemap.xml`, `/.well-known/api-catalog`, and homepage `Link` headers.
- [ ] Second-wave candidates have explicit go/no-go decisions, verified by checked items or accepted notes in the agent skills and markdown negotiation plans.
- [ ] Deferred capabilities are not falsely advertised, verified by production checks that OAuth/Auth.md/DNS-AID/MCP/WebMCP endpoints or records are absent unless backed by working implementations.
- [x] Completed first-wave child plans are archived according to `docs/plans/README.md`, verified by their checked completion checklists and files under `docs/plans/archived/`.
