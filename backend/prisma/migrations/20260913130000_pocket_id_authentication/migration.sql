-- CreateTable
CREATE TABLE "federated_identities" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "provider" VARCHAR(32) NOT NULL,
    "issuer" TEXT NOT NULL,
    "issuer_hash" VARCHAR(64) NOT NULL,
    "subject" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "federated_identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oidc_login_attempts" (
    "id" UUID NOT NULL,
    "provider" VARCHAR(32) NOT NULL,
    "client_type" VARCHAR(16) NOT NULL,
    "state_hash" VARCHAR(64) NOT NULL,
    "client_nonce_hash" VARCHAR(64) NOT NULL,
    "pkce_verifier_encrypted" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "exchange_ticket_hash" VARCHAR(64),
    "issuer" TEXT,
    "issuer_hash" VARCHAR(64),
    "subject" VARCHAR(255),
    "preferred_username" VARCHAR(64),
    "callback_completed_at" TIMESTAMP(3),
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "oidc_login_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "federated_identities_provider_issuer_hash_subject_key" ON "federated_identities"("provider", "issuer_hash", "subject");

-- CreateIndex
CREATE INDEX "federated_identities_user_id_idx" ON "federated_identities"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "oidc_login_attempts_state_hash_key" ON "oidc_login_attempts"("state_hash");

-- CreateIndex
CREATE UNIQUE INDEX "oidc_login_attempts_exchange_ticket_hash_key" ON "oidc_login_attempts"("exchange_ticket_hash");

-- CreateIndex
CREATE INDEX "oidc_login_attempts_expires_at_idx" ON "oidc_login_attempts"("expires_at");

-- AddForeignKey
ALTER TABLE "federated_identities" ADD CONSTRAINT "federated_identities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
