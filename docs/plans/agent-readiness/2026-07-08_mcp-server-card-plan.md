## Goal

Publish an MCP Server Card at `/.well-known/mcp/server-card.json` that accurately advertises Kestrel's MCP server information, transport endpoint, and capabilities.

## Context

- The repository currently has a web app and NestJS API, but no obvious MCP server implementation.
- Do not publish a server card that points to a nonexistent or incompatible MCP endpoint.
- Reference: MCP Server Card SEP-1649 draft pull request and `https://isitagentready.com/.well-known/agent-skills/mcp-server-card/SKILL.md`.

## Unknowns

- Whether Kestrel should expose an MCP server, and which tools/resources are safe to expose.
- Which transport to use for the server endpoint and which card schema version will be current at implementation time.

## Plan

- [ ] Review the current MCP server card draft/schema and decide whether Kestrel will implement MCP in this release; verify the decision in a design note or explicit user acceptance.
- [ ] Define the MCP capabilities to expose, such as read-only library resources or remote-control tools, and mark dangerous actions that require user confirmation; verify against backend permissions and product policy.
- [ ] Implement or configure an MCP server endpoint before publishing the card; verify with an MCP client smoke test or protocol-level curl/HTTP test for the chosen transport.
- [ ] Add `web/app/.well-known/mcp/server-card.json/route.ts` or an equivalent static file returning `Content-Type: application/json` with `serverInfo`, transport endpoint, and capabilities; verify locally with `curl -i http://127.0.0.1:3301/.well-known/mcp/server-card.json`.
- [ ] Reference the card from homepage `Link` headers, API catalog, or agent skills index only after the endpoint works; verify all discovery links resolve.
- [ ] Deploy and verify production card and MCP transport with `curl -i "$SITE_ORIGIN/.well-known/mcp/server-card.json"` plus the chosen MCP smoke test.

## Risks

- The server-card schema is still being standardized and may change.
- MCP tools can execute state-changing operations, so authorization and confirmation boundaries must be explicit.

## Rollback / Recovery

- Remove the server card and discovery links, then disable the MCP endpoint if needed; verify production no longer advertises MCP support.

## Completion Checklist

- [ ] A working MCP transport endpoint exists before the card is advertised, verified by an MCP smoke test or protocol-level test.
- [ ] `/.well-known/mcp/server-card.json` returns valid JSON with `serverInfo`, transport, and capabilities, verified by production `curl` and schema review.
- [ ] Discovery links to the card are present only when the MCP endpoint is healthy, verified by homepage/API catalog curl output.
