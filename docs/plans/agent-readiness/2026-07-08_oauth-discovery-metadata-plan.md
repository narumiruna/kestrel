## Goal

Publish OAuth 2.0 Authorization Server Metadata or OpenID Connect Discovery metadata so agents can discover how to authenticate with Kestrel APIs.

## Context

- Kestrel currently has custom username/password, TOTP, refresh, and HMAC-signed bearer access-token endpoints under `backend/src/auth`; access tokens are not JWTs and no JWKS endpoint exists.
- Do not publish OAuth/OIDC metadata that implies standards-compliant behavior unless the corresponding protocol endpoints actually exist.
- References: OpenID Connect Discovery 1.0, RFC 8414, and `https://isitagentready.com/.well-known/agent-skills/oauth-discovery/SKILL.md`.

## Unknowns

- Whether Kestrel should implement full OAuth/OIDC or declare the goal not applicable until a standards-compliant auth server exists.
- The intended issuer URL, supported grant types, scopes, and client registration policy.

## Plan

- [ ] Decide whether this release will implement standards-compliant OAuth/OIDC discovery or explicitly mark it not applicable; verify with user/product acceptance because the current custom auth is not OAuth/OIDC.
- [ ] If proceeding, choose OIDC (`/.well-known/openid-configuration`) or pure OAuth (`/.well-known/oauth-authorization-server`) and define issuer, authorization endpoint, token endpoint, JWKS requirements, grant types, and scopes; verify in an auth design note.
- [ ] Implement missing protocol endpoints or adapt existing auth endpoints only where semantics match the chosen spec; verify with auth unit/e2e tests in `backend`.
- [ ] Publish the selected well-known metadata from the web or backend origin with correct `Content-Type: application/json`; verify locally with `curl -i http://127.0.0.1:3301/.well-known/oauth-authorization-server` or the OIDC path.
- [ ] Add discovery links to the API catalog, protected resource metadata, and homepage `Link` headers where appropriate; verify all linked URLs resolve.
- [ ] Deploy and verify production metadata with `curl -i "$SITE_ORIGIN/.well-known/oauth-authorization-server"` or `curl -i "$SITE_ORIGIN/.well-known/openid-configuration"`.

## Risks

- Faking OAuth metadata over custom auth can break agents and create security misunderstandings.
- Adding OAuth/OIDC changes auth surface area and requires threat modeling, token validation, and client registration decisions.

## Rollback / Recovery

- Remove the well-known metadata and discovery links if protocol support is incomplete; verify agents no longer discover unsupported auth metadata.

## Completion Checklist

- [ ] The project either publishes standards-compliant OAuth/OIDC metadata or records explicit not-applicable acceptance, verified by the auth design note.
- [ ] If published, the metadata endpoint returns `200` JSON with issuer, authorization endpoint, token endpoint, JWKS URI when required, and supported grant types, verified by production `curl` and spec review.
- [ ] Authentication behavior is covered by backend tests, verified by `cd backend && npm run test` or targeted auth test output.
