-- AlterTable
ALTER TABLE "oidc_login_attempts"
ADD COLUMN "source_hash" VARCHAR(64);

-- CreateIndex
CREATE INDEX "oidc_login_attempts_provider_source_hash_expires_at_idx"
ON "oidc_login_attempts"("provider", "source_hash", "expires_at");
