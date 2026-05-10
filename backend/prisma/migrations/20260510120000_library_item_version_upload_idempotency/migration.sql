ALTER TABLE "library_items" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

CREATE TABLE "sync_upload_mutations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "client_mutation_id" VARCHAR(128) NOT NULL,
    "request_hash" VARCHAR(64) NOT NULL,
    "result" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sync_upload_mutations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sync_upload_mutations_user_id_client_mutation_id_key"
    ON "sync_upload_mutations"("user_id", "client_mutation_id");

CREATE INDEX "sync_upload_mutations_user_id_idx" ON "sync_upload_mutations"("user_id");

ALTER TABLE "sync_upload_mutations"
    ADD CONSTRAINT "sync_upload_mutations_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
