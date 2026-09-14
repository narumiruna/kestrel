# Web OIDC account linking plan

## Goal

Let a user who is already signed in to Kestrel on the Web account page link the configured OIDC identity (including Pocket ID) to the existing Kestrel account without creating or merging another account.

## Architecture

- Keep normal OIDC sign-in and provisioning unchanged.
- Require a current-password step-up before starting a Web-only link flow.
- Bind encrypted OIDC authorization state and the persisted callback attempt to the initiating Kestrel session and a client nonce.
- Complete linking through an authenticated exchange. Atomically consume the one-time ticket and create the `FederatedIdentity` only when the initiating session is still active and belongs to the same user.
- Treat the immutable `(issuer, sub)` identity as authoritative. Reject identities owned by another Kestrel account and prevent more than one identity for the configured issuer from being linked to one account.

## Plan

- [x] Extend `OidcLoginAttempt` and add a versioned Prisma migration for flow purpose and initiating session; Prisma validation and Client generation pass.
- [x] Add retry-safe Backend link status, password-confirmed start, callback binding, and authenticated exchange behavior with audit events and collision tests.
- [x] Add Web account-page controls and durable callback handling for linking the configured provider while retaining the current Kestrel session.
- [x] Update OIDC documentation with account-linking behavior and limitations.
- [x] Re-run all affected Backend and Web checks after rebasing onto `origin/main`.

## Risks

- A stolen Kestrel session must not be sufficient to attach an attacker-controlled OIDC identity; starting the flow requires password step-up.
- A callback fragment must not be usable from another browser session; exchange requires both the client nonce and the exact still-active initiating Kestrel session.
- Concurrent attempts must not attach one OIDC identity to multiple users or multiple identities for the configured issuer to one user.
- Existing OIDC authorization states and login attempts must remain valid during deployment; missing flow-purpose state is treated as normal login.

## Rollback / Recovery

- The migration only adds nullable/defaulted attempt metadata and a uniqueness constraint over existing federated identities; it does not rewrite user or identity ownership.
- Do not apply or roll back the migration against production as part of this task. Production migration follows `docs/operations.md` with explicit approval and a verified backup.

## Completion Checklist

- [x] Existing local accounts can link Pocket ID from the Web account page after password confirmation.
- [x] Normal Web and Android OIDC sign-in behavior remains unchanged.
- [x] Cross-account identity collisions, session mismatch/revocation, replay, and response-loss retry behavior are covered by tests.
- [x] Backend lint, 194 unit tests, 9 end-to-end tests, typecheck, and build pass after rebase.
- [x] Web format/lint, typecheck, 16 tests, and build pass after rebase; lint reports only the repository's existing CSS specificity warnings.
- [x] Move this completed plan to `docs/plans/archived/`.
