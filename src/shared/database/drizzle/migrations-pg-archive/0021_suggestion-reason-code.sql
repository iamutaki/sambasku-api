-- reason_code untuk chip alasan usul-edit (docs/api/17).
ALTER TABLE "word_edit_suggestions" ADD COLUMN IF NOT EXISTS "reason_code" varchar(40) DEFAULT 'other' NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "suggestions_reason_code_idx" ON "word_edit_suggestions" USING btree ("reason_code");
