CREATE UNIQUE INDEX "sessions_refresh_token_hash_key" ON "sessions"("refresh_token_hash");

CREATE TABLE "auth_rate_limits" (
    "id" UUID NOT NULL,
    "type" VARCHAR(32) NOT NULL,
    "subject" VARCHAR(128) NOT NULL,
    "attempts" INTEGER NOT NULL,
    "window_started_at" TIMESTAMP(3) NOT NULL,
    "blocked_until" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auth_rate_limits_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "auth_rate_limits_type_subject_key" ON "auth_rate_limits"("type", "subject");

CREATE TABLE "auth_audit_logs" (
    "id" UUID NOT NULL,
    "event" VARCHAR(32) NOT NULL,
    "outcome" VARCHAR(16) NOT NULL,
    "auth_method" VARCHAR(32),
    "failure_reason" VARCHAR(128),
    "username" VARCHAR(64),
    "user_id" UUID,
    "session_id" UUID,
    "ip_address" VARCHAR(64),
    "user_agent" VARCHAR(512),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "auth_audit_logs_user_id_idx" ON "auth_audit_logs"("user_id");
CREATE INDEX "auth_audit_logs_session_id_idx" ON "auth_audit_logs"("session_id");

ALTER TABLE "auth_audit_logs"
ADD CONSTRAINT "auth_audit_logs_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
