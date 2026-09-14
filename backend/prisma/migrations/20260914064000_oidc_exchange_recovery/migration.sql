-- AlterTable
ALTER TABLE "oidc_login_attempts"
ADD COLUMN "callback_started_at" TIMESTAMP(3),
ADD COLUMN "exchange_session_id" UUID,
ADD COLUMN "exchange_refresh_token_encrypted" TEXT;
