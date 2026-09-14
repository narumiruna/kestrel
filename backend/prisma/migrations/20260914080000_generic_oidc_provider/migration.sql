-- Rename the provider discriminator used by the initial provider-specific implementation.
UPDATE "federated_identities"
SET "provider" = 'oidc'
WHERE "provider" = 'pocket_id';

UPDATE "oidc_login_attempts"
SET "provider" = 'oidc'
WHERE "provider" = 'pocket_id';
