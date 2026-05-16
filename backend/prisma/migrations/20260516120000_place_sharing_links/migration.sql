ALTER TABLE "share_links"
    ADD COLUMN "place_id" UUID;

ALTER TABLE "share_links"
    ALTER COLUMN "route_id" DROP NOT NULL;

CREATE INDEX "share_links_place_id_idx" ON "share_links"("place_id");

CREATE UNIQUE INDEX "share_links_owner_id_place_id_active_key"
    ON "share_links"("owner_id", "place_id")
    WHERE "disabled_at" IS NULL AND "place_id" IS NOT NULL;

ALTER TABLE "share_links"
    ADD CONSTRAINT "share_links_place_id_fkey"
    FOREIGN KEY ("place_id") REFERENCES "places"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "share_links"
    ADD CONSTRAINT "share_links_exactly_one_target_check"
    CHECK (
        (("place_id" IS NOT NULL)::integer + ("route_id" IS NOT NULL)::integer) = 1
    );

ALTER TABLE "share_links"
    ADD CONSTRAINT "share_links_route_revision_requires_route_check"
    CHECK ("route_revision_id" IS NULL OR "route_id" IS NOT NULL);
