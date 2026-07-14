## Goal

Implement the low-risk discovery-hygiene foundation Kestrel can accurately support without claiming OAuth, agent registration, MCP, WebMCP, or other capabilities the product does not provide.

## Context

The first-wave discovery work is complete. Later capability drafts were removed from active planning because they have no current product requirement or protocol implementation; a new focused plan should be created only if one of those capabilities becomes a real product goal.

## Non-Goals

- Do not implement OAuth/OIDC, MCP, WebMCP, or DNS-AID just to satisfy a scanner.
- Do not publish metadata that implies standards-compliant auth, MCP, or browser tool support before those capabilities exist.
- Do not index capability URLs such as `/share/[token]` unless there is an explicit product decision to make shared content discoverable.

## Plan

- [x] Implement the first-wave `robots.txt` bundle by combining `docs/plans/archived/2026-07-08_robots-crawl-rules-plan.md`, `docs/plans/archived/2026-07-08_ai-crawler-robots-rules-plan.md`, and `docs/plans/archived/2026-07-08_content-signals-robots-plan.md` into one coherent `/robots.txt`; verified with `npm run build` and local production-mode `curl -i http://127.0.0.1:3411/robots.txt` returning `200` plain text with wildcard, AI crawler, Content Signal, and sitemap rules.
- [x] Implement `docs/plans/archived/2026-07-08_sitemap-discovery-plan.md` with only approved canonical public URLs; verified `/sitemap.xml` returns `200` XML and excludes `/dashboard/*`, `/api/backend/*`, and tokenized `/share/[token]` URLs by local production-mode curl plus Python assertions.
- [x] Implement `docs/plans/archived/2026-07-08_api-catalog-plan.md` as a conservative catalog that advertises real docs/status resources only; verified `/.well-known/api-catalog` returns `application/linkset+json`, omits `service-desc` because no OpenAPI exists, and every advertised link resolves locally.
- [x] Implement `docs/plans/archived/2026-07-08_homepage-link-headers-plan.md` after the linked resources exist; verified `curl -I http://127.0.0.1:3411/` and `/login` advertise only working resources: `/sitemap.xml` and `/.well-known/api-catalog`.

## Risks

- Publishing placeholder metadata can cause agents to trust capabilities that do not exist.
- Making shared token URLs indexable can expose by-link content more broadly than intended.
- Too many independent discovery files can drift unless implemented in staged bundles with shared validation.

## Rollback / Recovery

- If a published discovery resource is wrong, remove its homepage `Link` header and well-known/static endpoint first, then redeploy; verify with production `curl` that agents no longer discover the stale resource.
- If crawler policy is wrong, update `robots.txt` as the single source of truth and verify production response after deploy.

## Completion Checklist

- [x] First-wave discovery hygiene is complete in the codebase, verified by `npm run build`, `npm run typecheck`, `just web-check`, `just web-lint`, and local production-mode `curl` evidence for `/robots.txt`, `/sitemap.xml`, `/.well-known/api-catalog`, and homepage `Link` headers.
- [x] Published discovery metadata advertises only implemented resources, verified by the API catalog and homepage-link validation recorded above.
- [x] Completed first-wave child plans are archived according to `docs/plans/README.md`, verified by their checked completion checklists and files under `docs/plans/archived/`.
