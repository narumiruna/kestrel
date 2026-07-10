-- Add client metadata to sessions for owner-visible session management.
ALTER TABLE "sessions"
ADD COLUMN "ip_address" VARCHAR(64),
ADD COLUMN "user_agent" VARCHAR(512);

-- Link Android devices to the authenticated session that registered them and
-- retain revoked devices for owner-visible audit/history.
ALTER TABLE "devices"
ADD COLUMN "registered_session_id" UUID,
ADD COLUMN "revoked_at" TIMESTAMP(3);

CREATE INDEX "devices_registered_session_id_idx" ON "devices"("registered_session_id");

ALTER TABLE "devices"
ADD CONSTRAINT "devices_registered_session_id_fkey"
FOREIGN KEY ("registered_session_id") REFERENCES "sessions"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
