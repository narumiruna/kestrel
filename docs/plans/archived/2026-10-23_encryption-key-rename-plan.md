# Encryption key environment variable rename

## Goal

Use `ENCRYPTION_KEY` for AI credential encryption in Backend, Compose, and GitHub Actions. Keep TOTP/OIDC keys, encryption format, and stored ciphertext unchanged.

## Plan

- [x] Make the secret-box test configuration accept only `ENCRYPTION_KEY` and confirm the old implementation fails. The targeted suite failed 13 tests with the old variable name; malformed-key checks still passed.
- [x] Rename the AI key setting and update environment examples, deployment wiring, and operator documentation.
- [x] Run Backend tests, lint, and typecheck; validate Compose and the deploy workflow with dummy values only. Node.js 26.10.0: 418 unit tests and 21 e2e tests passed; lint, typecheck, and build passed. Actionlint passed. Both Compose files passed configured/missing-key checks with dummy values.

## Rollback / Recovery

Existing deployments must use the current AI credential key value under the new variable name. A variable rename does not require key rotation or database changes. Rollback must restore the previous variable name with the same key value. Do not change secrets or deploy as part of this local task.

## Completion Checklist

- [x] Backend reads only `ENCRYPTION_KEY`; missing and malformed keys still fail closed.
- [x] Compose and GitHub Actions pass the new variable; examples and documentation match.
- [x] Relevant checks pass and no old AI key name remains in tracked configuration or source. `git grep` found no old name; `git diff --check` passed.
- [x] No deployment, secret update, database change, or device operation was performed.
