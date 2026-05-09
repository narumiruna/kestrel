CREATE TYPE "SyncEntityType" AS ENUM (
    'PLACE',
    'ROUTE',
    'ROUTE_REVISION',
    'LIBRARY_ITEM',
    'DEVICE_STATE'
);

CREATE TYPE "SyncOperation" AS ENUM ('UPSERT', 'DELETE');

CREATE TABLE "sync_events" (
    "id" BIGSERIAL NOT NULL,
    "user_id" UUID NOT NULL,
    "entity_type" "SyncEntityType" NOT NULL,
    "entity_id" UUID NOT NULL,
    "operation" "SyncOperation" NOT NULL,
    "payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sync_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "sync_events_user_id_id_idx" ON "sync_events"("user_id", "id");
CREATE INDEX "sync_events_user_id_created_at_idx" ON "sync_events"("user_id", "created_at");
CREATE INDEX "sync_events_user_id_entity_type_entity_id_id_idx"
    ON "sync_events"("user_id", "entity_type", "entity_id", "id");

ALTER TABLE "sync_events" ADD CONSTRAINT "sync_events_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
