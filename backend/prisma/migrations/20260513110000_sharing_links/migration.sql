CREATE TYPE "SharePermission" AS ENUM ('PUBLIC_READ');

CREATE TABLE "share_links" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "owner_id" UUID NOT NULL,
    "route_id" UUID NOT NULL,
    "route_revision_id" UUID,
    "token" VARCHAR(128) NOT NULL,
    "permission" "SharePermission" NOT NULL DEFAULT 'PUBLIC_READ',
    "disabled_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "share_links_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "share_links_token_key" ON "share_links"("token");
CREATE INDEX "share_links_owner_id_idx" ON "share_links"("owner_id");
CREATE INDEX "share_links_route_id_idx" ON "share_links"("route_id");
CREATE INDEX "share_links_route_revision_id_idx" ON "share_links"("route_revision_id");
CREATE UNIQUE INDEX "share_links_owner_id_route_id_active_latest_key"
    ON "share_links"("owner_id", "route_id")
    WHERE "disabled_at" IS NULL AND "route_revision_id" IS NULL;

ALTER TABLE "share_links"
    ADD CONSTRAINT "share_links_owner_id_fkey"
    FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "share_links"
    ADD CONSTRAINT "share_links_route_id_fkey"
    FOREIGN KEY ("route_id") REFERENCES "routes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "share_links"
    ADD CONSTRAINT "share_links_route_revision_id_fkey"
    FOREIGN KEY ("route_revision_id") REFERENCES "route_revisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
