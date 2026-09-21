-- Gerbang publikasi makna (17-api-usul-definisi.md): makna jadi entitas
-- anak yang bisa dikontribusikan ke kata existing (contributor → pending).
-- DEFAULT published = backfill baris existing (makna lama selalu tayang).
ALTER TABLE "meanings" ADD COLUMN "is_have_definition" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "meanings" ADD COLUMN "status" varchar(30) DEFAULT 'published' NOT NULL;--> statement-breakpoint
ALTER TABLE "meanings" ADD COLUMN "is_verified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "meanings" ADD COLUMN "is_corrected" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Antrean moderasi membaca per kata + status (pola examples).
CREATE INDEX "meanings_word_status_idx" ON "meanings" USING btree ("word_id", "status");
