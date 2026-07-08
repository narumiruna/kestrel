## Goal

Publish `/auth.md` and related OAuth metadata so agents can understand how to register, authenticate, obtain credentials, and handle claims or revocation for Kestrel APIs.

## Context

- Kestrel currently supports human registration/login with TOTP but does not expose an agent registration protocol.
- This plan depends on the OAuth discovery and OAuth Protected Resource Metadata plans if agents need API tokens.
- References: WorkOS Auth.md, `https://github.com/workos/auth.md`, and `https://isitagentready.com/.well-known/agent-skills/auth-md/SKILL.md`.

## Unknowns

- Whether agent registration should be self-service, manual approval, or unsupported for now.
- Which agent identity types and credential types Kestrel will accept.
- Whether claim and revocation URLs need new backend endpoints.

## Plan

- [ ] Decide the agent registration policy, identity types, credential types, and support contact; verify with a committed auth policy note or user acceptance.
- [ ] Implement or document the registration path in `/auth.md`, including prerequisites, OAuth/OIDC discovery URLs, protected resource metadata URL, scopes, and revocation instructions; verify the markdown renders as plain text/markdown at the site root.
- [ ] Add an `agent_auth` block to `/.well-known/oauth-authorization-server` only if Kestrel has a standards-compliant OAuth AS; verify the JSON field names against the Auth.md guidance and production `curl` output.
- [ ] Implement any missing register, claim, or revocation endpoints before linking them; verify with backend tests and `curl -i` for each advertised endpoint.
- [ ] Deploy and verify `curl -i "$SITE_ORIGIN/auth.md"` returns `200`, a markdown/plain text content type, and accurate registration instructions.
- [ ] Add `auth.md` and auth discovery URLs to the API catalog or homepage `Link` headers if appropriate; verify links resolve.

## Risks

- Publishing registration instructions before endpoints exist can lead agents to fail or expose unsupported flows.
- Agent registration can increase abuse risk if rate limits, approval, and revocation are not defined.

## Rollback / Recovery

- Remove `/auth.md`, the `agent_auth` metadata block, and related discovery links; verify production no longer advertises agent registration.

## Completion Checklist

- [ ] `/auth.md` returns accurate agent registration instructions, verified by production `curl -i "$SITE_ORIGIN/auth.md"` and policy review.
- [ ] OAuth metadata includes `agent_auth` only when backed by working endpoints, verified by JSON review and backend tests.
- [ ] All URLs referenced by `/auth.md` resolve or are explicitly marked manual/offline, verified by `curl -i` evidence.
