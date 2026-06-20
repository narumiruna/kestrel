CREATE TYPE "RemoteCommandStatus" AS ENUM (
    'QUEUED',
    'DELIVERED',
    'APPLIED',
    'FAILED',
    'EXPIRED'
);

CREATE TYPE "RemoteCommandType" AS ENUM (
    'SET_POINT',
    'START_ROUTE',
    'STOP'
);

ALTER TABLE "devices"
    ADD COLUMN "client_device_id" VARCHAR(128),
    ADD COLUMN "remote_control_enabled" BOOLEAN NOT NULL DEFAULT false;

UPDATE "devices"
SET "client_device_id" = 'migrated-' || gen_random_uuid()::text
WHERE "client_device_id" IS NULL;

ALTER TABLE "devices"
    ALTER COLUMN "client_device_id" SET NOT NULL;

CREATE UNIQUE INDEX "devices_user_id_client_device_id_key"
    ON "devices"("user_id", "client_device_id");

CREATE TABLE "remote_commands" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "type" "RemoteCommandType" NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "RemoteCommandStatus" NOT NULL DEFAULT 'QUEUED',
    "error_message" VARCHAR(1024),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "delivered_at" TIMESTAMP(3),
    "applied_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "remote_commands_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "remote_commands_user_id_device_id_status_created_at_idx"
    ON "remote_commands"("user_id", "device_id", "status", "created_at");
CREATE INDEX "remote_commands_device_id_status_created_at_idx"
    ON "remote_commands"("device_id", "status", "created_at");
CREATE INDEX "remote_commands_expires_at_idx" ON "remote_commands"("expires_at");

ALTER TABLE "remote_commands"
    ADD CONSTRAINT "remote_commands_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "remote_commands"
    ADD CONSTRAINT "remote_commands_device_id_fkey"
    FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
