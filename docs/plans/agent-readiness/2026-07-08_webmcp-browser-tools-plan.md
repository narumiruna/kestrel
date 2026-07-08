## Goal

Support WebMCP on Kestrel web pages by registering browser-available tools through `navigator.modelContext.provideContext()` when the API is available.

## Context

- Kestrel's web UI is a Next.js/React app with authenticated dashboard actions for places, routes, sharing, and remote control.
- WebMCP is browser-experimental; implementation must feature-detect support and preserve normal behavior for browsers without it.
- References: WebMCP draft, Chrome WebMCP article, and `https://isitagentready.com/.well-known/agent-skills/webmcp/SKILL.md`.

## Unknowns

- Which site actions should be exposed as tools, and which require explicit user confirmation.
- Browser support and exact TypeScript surface for `navigator.modelContext` at implementation time.

## Plan

- [ ] Review current WebMCP API docs and define an ambient TypeScript type for `navigator.modelContext.provideContext`; verify `cd web && npm run typecheck` accepts the type without `any` leaks beyond the boundary.
- [ ] Choose an initial safe tool set, such as reading current route/place context, navigating to dashboard sections, or preparing share links, and exclude destructive actions unless confirmation is built in; verify with user/product acceptance.
- [ ] Implement a client-only `WebMcpProvider` component that feature-detects `navigator.modelContext?.provideContext()` and registers tool definitions with `name`, `description`, `inputSchema`, and `execute`; verify no server-side rendering errors in `cd web && npm run build`.
- [ ] Reuse existing authenticated API client/session handling for tool execution and return structured success/error results; verify with unit-level tests or a manual authenticated browser smoke test.
- [ ] Add privacy and permission guards so tools do not expose authenticated data to unsupported contexts or anonymous pages; verify by testing logged-out and logged-in page loads.
- [ ] Validate in a WebMCP-capable browser or experimental Chrome build; verify via DevTools or browser agent tooling that tools are detected on page load.

## Risks

- The WebMCP API may change and break experimental implementations.
- Tools that mutate places, routes, or devices can cause user-visible state changes if confirmation is missing.

## Rollback / Recovery

- Remove the provider from `web/app/layout.tsx` or gate it behind a feature flag; verify page load no longer registers WebMCP tools.

## Completion Checklist

- [ ] WebMCP tools are registered only in supported browsers, verified by a browser/DevTools smoke test and absence of errors in unsupported browsers.
- [ ] Each registered tool has name, description, JSON Schema input, and execute callback, verified by code review of the provider.
- [ ] Web build and typecheck pass, verified by `cd web && npm run typecheck && npm run build`.
- [ ] Browser validation evidence includes the tested URL and viewport or screenshot, verified per project web UI validation rules.
