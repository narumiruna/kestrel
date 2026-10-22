CREATE TABLE "ai_settings" (
  "user_id" UUID NOT NULL,
  "generation" INTEGER NOT NULL DEFAULT 0 CHECK ("generation" >= 0),
  "selection" JSONB,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_settings_pkey" PRIMARY KEY ("user_id"),
  CONSTRAINT "ai_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "ai_connections" (
  "user_id" UUID NOT NULL,
  "provider_id" VARCHAR(64) NOT NULL,
  "generation" INTEGER NOT NULL DEFAULT 0 CHECK ("generation" >= 0),
  "auth_method" VARCHAR(16),
  "status" VARCHAR(32) NOT NULL DEFAULT 'disconnected',
  "credential_encrypted" TEXT,
  "lease_id" UUID,
  "lease_expires_at" TIMESTAMP(3),
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_connections_pkey" PRIMARY KEY ("user_id", "provider_id"),
  CONSTRAINT "ai_connections_status_check" CHECK ("status" IN ('connected', 'reconnect_required', 'disconnected')),
  CONSTRAINT "ai_connections_method_check" CHECK ("auth_method" IS NULL OR "auth_method" IN ('api_key', 'oauth')),
  CONSTRAINT "ai_connections_lease_check" CHECK (("lease_id" IS NULL) = ("lease_expires_at" IS NULL)),
  CONSTRAINT "ai_connections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "ai_authorizations" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "session_id" UUID NOT NULL,
  "provider_id" VARCHAR(64) NOT NULL,
  "generation" INTEGER NOT NULL CHECK ("generation" >= 0),
  "result_generation" INTEGER,
  "state_hash" VARCHAR(64) NOT NULL,
  "verifier_encrypted" TEXT,
  "code_encrypted" TEXT,
  "status" VARCHAR(32) NOT NULL DEFAULT 'pending',
  "expires_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_authorizations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ai_authorizations_status_check" CHECK ("status" IN ('pending', 'code_received', 'processing', 'completed', 'cancelled', 'failed')),
  CONSTRAINT "ai_authorizations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ai_authorizations_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ai_authorizations_state_hash_key" ON "ai_authorizations"("state_hash");
CREATE INDEX "ai_authorizations_user_id_provider_id_status_idx" ON "ai_authorizations"("user_id", "provider_id", "status");
CREATE INDEX "ai_authorizations_session_id_idx" ON "ai_authorizations"("session_id");
CREATE INDEX "ai_authorizations_expires_at_idx" ON "ai_authorizations"("expires_at");
