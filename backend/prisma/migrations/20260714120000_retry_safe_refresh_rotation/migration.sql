-- Retain the immediately previous refresh-token hash and an encrypted copy of
-- its successor so a lost rotation response can be retried for a short window.
ALTER TABLE "sessions"
ADD COLUMN "previous_refresh_token_hash" TEXT,
ADD COLUMN "rotated_refresh_token_encrypted" TEXT,
ADD COLUMN "refresh_token_rotated_at" TIMESTAMP(3),
ADD COLUMN "refresh_request_id" VARCHAR(128);

CREATE UNIQUE INDEX "sessions_previous_refresh_token_hash_key"
ON "sessions"("previous_refresh_token_hash");

-- Keep consumed token hashes for the lifetime of the session so replay of a
-- token older than the immediate retry predecessor still revokes its family.
CREATE TABLE "refresh_token_history" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "consumed_at" TIMESTAMP(3) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "refresh_token_history_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "refresh_token_history_token_hash_key"
ON "refresh_token_history"("token_hash");

CREATE INDEX "refresh_token_history_session_id_idx"
ON "refresh_token_history"("session_id");

CREATE INDEX "refresh_token_history_expires_at_idx"
ON "refresh_token_history"("expires_at");

ALTER TABLE "refresh_token_history"
ADD CONSTRAINT "refresh_token_history_session_id_fkey"
FOREIGN KEY ("session_id") REFERENCES "sessions"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
