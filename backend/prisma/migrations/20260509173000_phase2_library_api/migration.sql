CREATE TYPE "DevicePlatform" AS ENUM ('ANDROID', 'WEB', 'OTHER');
CREATE TYPE "LibraryItemKind" AS ENUM ('PLACE', 'ROUTE');
CREATE TYPE "PlaybackState" AS ENUM ('IDLE', 'SINGLE', 'ROUTE', 'PAUSED');
CREATE TYPE "RouteMode" AS ENUM ('ONCE', 'LOOP', 'PING_PONG');

CREATE TABLE "places" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" VARCHAR(128) NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "description" VARCHAR(1024),
    "tags" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "places_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "routes" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" VARCHAR(128) NOT NULL,
    "description" VARCHAR(1024),
    "default_speed_kmh" DOUBLE PRECISION NOT NULL,
    "mode" "RouteMode" NOT NULL,
    "current_revision_id" UUID,
    "is_public" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "routes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "route_revisions" (
    "id" UUID NOT NULL,
    "route_id" UUID NOT NULL,
    "revision_number" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "route_revisions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "library_items" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "kind" "LibraryItemKind" NOT NULL,
    "place_id" UUID,
    "route_id" UUID,
    "sort_order" INTEGER NOT NULL,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "last_used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "library_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "devices" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" VARCHAR(128) NOT NULL,
    "platform" "DevicePlatform" NOT NULL,
    "app_version" VARCHAR(64),
    "last_seen_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "device_states" (
    "id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "selected_place_id" UUID,
    "selected_route_id" UUID,
    "selected_route_revision_id" UUID,
    "playback_state" "PlaybackState" NOT NULL DEFAULT 'IDLE',
    "last_reported_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "device_states_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "routes_current_revision_id_key" ON "routes"("current_revision_id");
CREATE UNIQUE INDEX "route_revisions_route_id_revision_number_key" ON "route_revisions"("route_id", "revision_number");
CREATE UNIQUE INDEX "library_items_place_id_key" ON "library_items"("place_id");
CREATE UNIQUE INDEX "library_items_route_id_key" ON "library_items"("route_id");
CREATE UNIQUE INDEX "device_states_device_id_key" ON "device_states"("device_id");

CREATE INDEX "places_user_id_idx" ON "places"("user_id");
CREATE INDEX "places_user_id_deleted_at_idx" ON "places"("user_id", "deleted_at");
CREATE INDEX "routes_user_id_idx" ON "routes"("user_id");
CREATE INDEX "routes_user_id_deleted_at_idx" ON "routes"("user_id", "deleted_at");
CREATE INDEX "route_revisions_route_id_idx" ON "route_revisions"("route_id");
CREATE INDEX "route_revisions_created_by_idx" ON "route_revisions"("created_by");
CREATE INDEX "library_items_user_id_idx" ON "library_items"("user_id");
CREATE INDEX "library_items_user_id_deleted_at_idx" ON "library_items"("user_id", "deleted_at");
CREATE INDEX "devices_user_id_idx" ON "devices"("user_id");
CREATE INDEX "device_states_selected_place_id_idx" ON "device_states"("selected_place_id");
CREATE INDEX "device_states_selected_route_id_idx" ON "device_states"("selected_route_id");
CREATE INDEX "device_states_selected_route_revision_id_idx" ON "device_states"("selected_route_revision_id");

ALTER TABLE "places" ADD CONSTRAINT "places_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "routes" ADD CONSTRAINT "routes_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "routes" ADD CONSTRAINT "routes_current_revision_id_fkey"
    FOREIGN KEY ("current_revision_id") REFERENCES "route_revisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "route_revisions" ADD CONSTRAINT "route_revisions_route_id_fkey"
    FOREIGN KEY ("route_id") REFERENCES "routes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "route_revisions" ADD CONSTRAINT "route_revisions_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "library_items" ADD CONSTRAINT "library_items_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "library_items" ADD CONSTRAINT "library_items_place_id_fkey"
    FOREIGN KEY ("place_id") REFERENCES "places"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "library_items" ADD CONSTRAINT "library_items_route_id_fkey"
    FOREIGN KEY ("route_id") REFERENCES "routes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "devices" ADD CONSTRAINT "devices_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "device_states" ADD CONSTRAINT "device_states_device_id_fkey"
    FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "device_states" ADD CONSTRAINT "device_states_selected_place_id_fkey"
    FOREIGN KEY ("selected_place_id") REFERENCES "places"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "device_states" ADD CONSTRAINT "device_states_selected_route_id_fkey"
    FOREIGN KEY ("selected_route_id") REFERENCES "routes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "device_states" ADD CONSTRAINT "device_states_selected_route_revision_id_fkey"
    FOREIGN KEY ("selected_route_revision_id") REFERENCES "route_revisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
