-- Remove persisted raw session credentials; retries derive the same token from client-held secrets.
ALTER TABLE "oidc_login_attempts"
DROP COLUMN "exchange_refresh_token_encrypted";

-- Rename the provider discriminator used by the initial provider-specific implementation.
UPDATE "federated_identities"
SET "provider" = 'oidc'
WHERE "provider" = 'pocket_id';

UPDATE "oidc_login_attempts"
SET "provider" = 'oidc'
WHERE "provider" = 'pocket_id';
