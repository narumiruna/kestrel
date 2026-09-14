-- DropIndex
DROP INDEX "oidc_login_attempts_provider_source_hash_expires_at_idx";

-- AlterTable
ALTER TABLE "oidc_login_attempts"
DROP COLUMN "source_hash";
