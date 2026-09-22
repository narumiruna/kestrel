CREATE TABLE "android_login_attempts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "authorizing_session_id" UUID NOT NULL,
    "exchange_session_id" UUID,
    "qr_secret_hash" VARCHAR(64) NOT NULL,
    "verifier_challenge" VARCHAR(43),
    "device_name" VARCHAR(128),
    "app_version" VARCHAR(64),
    "claimed_at" TIMESTAMP(3),
    "approved_at" TIMESTAMP(3),
    "denied_at" TIMESTAMP(3),
    "consumed_at" TIMESTAMP(3),
    "last_polled_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "android_login_attempts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "android_login_attempts_claim_check" CHECK (
        ("claimed_at" IS NULL AND "verifier_challenge" IS NULL)
        OR
        ("claimed_at" IS NOT NULL AND "verifier_challenge" IS NOT NULL)
    ),
    CONSTRAINT "android_login_attempts_terminal_check" CHECK (
        NOT ("approved_at" IS NOT NULL AND "denied_at" IS NOT NULL)
        AND ("approved_at" IS NULL OR "claimed_at" IS NOT NULL)
        AND ("consumed_at" IS NULL OR "approved_at" IS NOT NULL)
        AND NOT ("consumed_at" IS NOT NULL AND "denied_at" IS NOT NULL)
    )
);

CREATE UNIQUE INDEX "android_login_attempts_exchange_session_id_key"
ON "android_login_attempts"("exchange_session_id");

CREATE UNIQUE INDEX "android_login_attempts_qr_secret_hash_key"
ON "android_login_attempts"("qr_secret_hash");

CREATE INDEX "android_login_attempts_user_id_created_at_idx"
ON "android_login_attempts"("user_id", "created_at");

CREATE INDEX "android_login_attempts_authorizing_session_id_idx"
ON "android_login_attempts"("authorizing_session_id");

CREATE INDEX "android_login_attempts_expires_at_idx"
ON "android_login_attempts"("expires_at");

ALTER TABLE "android_login_attempts"
ADD CONSTRAINT "android_login_attempts_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "android_login_attempts"
ADD CONSTRAINT "android_login_attempts_authorizing_session_id_fkey"
FOREIGN KEY ("authorizing_session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "android_login_attempts"
ADD CONSTRAINT "android_login_attempts_exchange_session_id_fkey"
FOREIGN KEY ("exchange_session_id") REFERENCES "sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
