-- Dialek default per bahasa (UI auto-select; user tetap bisa ganti).
-- Seed: code `umum` = default untuk SBS.
ALTER TABLE "dialects" ADD COLUMN "is_default" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
UPDATE "dialects" SET "is_default" = true WHERE "code" = 'umum' AND "deleted_at" IS NULL;
--> statement-breakpoint
-- Maksimal satu default aktif per language.
CREATE UNIQUE INDEX "dialects_language_default_unique"
  ON "dialects" ("language_id")
  WHERE "is_default" = true AND "deleted_at" IS NULL;
