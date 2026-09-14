-- Track whether an OIDC callback is for sign-in or for linking an existing account.
ALTER TABLE "oidc_login_attempts"
ADD COLUMN "flow_type" VARCHAR(16) NOT NULL DEFAULT 'login',
ADD COLUMN "link_session_id" UUID;

-- One configured OIDC issuer can be linked only once per Kestrel account.
CREATE UNIQUE INDEX "federated_identities_user_id_provider_issuer_hash_key"
ON "federated_identities"("user_id", "provider", "issuer_hash");

CREATE INDEX "oidc_login_attempts_link_session_id_idx"
ON "oidc_login_attempts"("link_session_id");

ALTER TABLE "oidc_login_attempts"
ADD CONSTRAINT "oidc_login_attempts_flow_binding_check"
CHECK (
    ("flow_type" = 'login' AND "link_session_id" IS NULL)
    OR
    ("flow_type" = 'link' AND "client_type" = 'web' AND "link_session_id" IS NOT NULL)
);
