## Goal

Return Markdown representations of HTML pages when agents request `Accept: text/markdown`, while preserving HTML as the default browser response.

## Context

- The web front end is a Next.js app served from Docker Compose in this repository.
- Cloudflare Markdown for Agents can satisfy this requirement if the production site is behind Cloudflare; otherwise the project needs an application or proxy implementation.
- References: Cloudflare Markdown for Agents and `https://isitagentready.com/.well-known/agent-skills/markdown-negotiation/SKILL.md`.

## Unknowns

- Whether the production site is proxied by Cloudflare or another programmable edge layer.
- Which pages need Markdown negotiation first: only public pages, or authenticated dashboard pages after login.

## Plan

- [ ] Identify the production serving path and whether Cloudflare Markdown for Agents is available; verify with deploy documentation or CDN console evidence.
- [ ] Choose the implementation strategy: enable Cloudflare Markdown for Agents if available, or add a repository-owned HTML-to-Markdown negotiation layer for approved public pages; verify the decision in a short docs note or PR description.
- [ ] Implement Markdown negotiation for approved HTML routes so `Accept: text/markdown` returns `Content-Type: text/markdown` and browser requests still return HTML; verify locally with paired `curl -H 'Accept: text/markdown'` and default `curl -H 'Accept: text/html'` requests.
- [ ] Add token-count metadata such as `x-markdown-tokens` when the selected platform supports it; verify with `curl -i` headers or mark not applicable with the platform reason.
- [ ] Ensure generated Markdown excludes secrets and authenticated data unless the request is authorized; verify with review of public/authenticated route handling and a negative curl test.
- [ ] Deploy and verify production negotiation with `curl -i -H 'Accept: text/markdown' "$SITE_ORIGIN/login"` and a default browser/HTML request.

## Risks

- HTML-to-Markdown conversion can leak hidden UI text or omit critical context.
- A global edge feature may affect routes the app did not intend to expose as Markdown.

## Rollback / Recovery

- Disable the Cloudflare feature or remove the negotiation layer; verify `Accept: text/markdown` no longer changes the default HTML response.

## Completion Checklist

- [ ] Approved HTML routes return `Content-Type: text/markdown` for `Accept: text/markdown`, verified by production `curl -i` output.
- [ ] Default browser requests still return HTML, verified by `curl -i -H 'Accept: text/html'` and a browser smoke check.
- [ ] Markdown scope and auth behavior are documented, verified by a committed docs note or PR description.
