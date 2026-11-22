-- Armazenamento de imagens no próprio Postgres (para hospedagens sem disco persistente, como a Vercel).
CREATE TABLE IF NOT EXISTS "file_blobs" (
	"key" text PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
	"mime" text NOT NULL,
	"data" bytea NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "file_blobs_tenant_idx" ON "file_blobs" ("tenant_id");
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON file_blobs TO ondaro_app;
--> statement-breakpoint
ALTER TABLE file_blobs ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON file_blobs FOR ALL TO ondaro_app USING (tenant_id = app_tenant()) WITH CHECK (tenant_id = app_tenant());
