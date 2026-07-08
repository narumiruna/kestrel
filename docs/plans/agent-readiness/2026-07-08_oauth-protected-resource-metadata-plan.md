## Goal

Publish `/.well-known/oauth-protected-resource` so agents can discover Kestrel's protected API resource identifier, authorization servers, and supported scopes.

## Context

- Most Kestrel backend endpoints require the existing bearer session token through `SessionAuthGuard`.
- Protected Resource Metadata depends on a truthful OAuth/OIDC authorization-server story; coordinate with the OAuth discovery plan.
- References: RFC 9728 and `https://isitagentready.com/.well-known/agent-skills/oauth-protected-resource/SKILL.md`.

## Unknowns

- The resource identifier for the Kestrel API, likely `$SITE_ORIGIN/api/backend` or the backend origin.
- Whether Kestrel will define OAuth scopes or keep a single authenticated-user capability model.

## Plan

- [ ] Resolve the OAuth discovery dependency: confirm an authorization server URL exists or record not-applicable acceptance; verify by linking to the completed OAuth discovery decision.
- [ ] Define the protected resource identifier and scope taxonomy for places, routes, sync, sharing, and remote-control APIs; verify with an auth/API design note and controller inventory.
- [ ] Implement `/.well-known/oauth-protected-resource` with `resource`, `authorization_servers`, and `scopes_supported` values that match actual enforcement; verify locally with `curl -i http://127.0.0.1:3301/.well-known/oauth-protected-resource`.
- [ ] If scopes are advertised, enforce or validate those scopes in backend authorization checks before publishing; verify with backend unit/e2e tests for allowed and denied scopes.
- [ ] Reference the protected resource metadata from API docs/catalog where useful; verify linked resources resolve.
- [ ] Deploy and verify production metadata with `curl -i "$SITE_ORIGIN/.well-known/oauth-protected-resource"` returning `200` JSON.

## Risks

- Advertising scopes not enforced by backend code gives agents false security semantics.
- Publishing resource metadata without an actual authorization server leaves agents unable to obtain usable tokens.

## Rollback / Recovery

- Remove the protected resource metadata route and any discovery links; verify production no longer advertises unsupported PRM data.

## Completion Checklist

- [ ] `/.well-known/oauth-protected-resource` is published only after the authorization-server dependency is satisfied or explicitly accepted as not applicable, verified by the linked auth decision.
- [ ] The metadata contains resource, authorization server, and scope data that matches backend behavior, verified by code review and auth tests.
- [ ] Production returns `200` JSON for the metadata endpoint, verified by `curl -i "$SITE_ORIGIN/.well-known/oauth-protected-resource"`.
