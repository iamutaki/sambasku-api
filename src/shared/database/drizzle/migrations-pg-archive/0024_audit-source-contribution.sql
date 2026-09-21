-- Link audit entries ke word-edit suggestion / contribution (riwayat edit kata).
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "source_contribution_id" varchar(26);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_logs_source_contribution_idx" ON "audit_logs" USING btree ("source_contribution_id");
