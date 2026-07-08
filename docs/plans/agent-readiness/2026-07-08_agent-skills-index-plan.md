## Goal

Publish an Agent Skills discovery index at `/.well-known/agent-skills/index.json` with schema metadata and SHA-256 digests for site-specific skill documents.

## Context

- The requested index should describe Kestrel capabilities for agents, not merely copy third-party readiness skill documents.
- The web app already serves static well-known files from `web/public/.well-known/`.
- References: Agent Skills Discovery RFC v0.2.0, agentskills.io, and `https://isitagentready.com/.well-known/agent-skills/agent-skills/SKILL.md`.

## Unknowns

- Which Kestrel skills should be advertised first, such as API usage, auth, MCP tools, or WebMCP browser actions.
- The current exact digest format required by the RFC, for example whether values are raw hex or prefixed with `sha256:`.

## Plan

- [ ] Select the first set of site-specific skills and define each skill's name, type, description, and canonical URL; verify with user/product acceptance or a committed skill inventory.
- [ ] Author skill documents under `web/public/.well-known/agent-skills/` with concise instructions and accurate links to Kestrel docs/endpoints; verify each file is fetchable locally with `curl -i`.
- [ ] Add a generation script, such as `scripts/generate-agent-skills-index.mjs`, that calculates SHA-256 digests and writes `web/public/.well-known/agent-skills/index.json`; verify by running the script and checking `sha256sum`/`shasum -a 256` matches the index.
- [ ] Include `$schema` and a `skills` array with `name`, `type`, `description`, `url`, and digest fields following the current RFC; verify with `jq` and schema review.
- [ ] Add the index generation/check to the web validation or release workflow so digests stay current; verify with `just web-check` or a dedicated script in CI.
- [ ] Deploy and verify `curl -i "$SITE_ORIGIN/.well-known/agent-skills/index.json"` returns `200` JSON and every skill URL/digest validates.

## Risks

- Stale digests make the index fail integrity checks.
- Advertising skills that depend on unfinished API/MCP/auth work creates unusable agent instructions.

## Rollback / Recovery

- Remove the index and skill documents or prune unfinished skills; verify production no longer advertises invalid entries.

## Completion Checklist

- [ ] The skills index contains `$schema` and a valid `skills` array, verified by `jq` and RFC review.
- [ ] Every advertised skill URL resolves and its SHA-256 digest matches the published document, verified by the generation/check script.
- [ ] The index is generated or checked on publish, verified by CI/release workflow output or a documented release command.
