CREATE TABLE "search_misses" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"term" varchar(255) NOT NULL,
	"direction" varchar(20) DEFAULT 'lemma' NOT NULL,
	"hit_count" integer DEFAULT 1 NOT NULL,
	"last_searched_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp,
	"deleted_at" timestamp,
	"deleted_by" varchar(26),
	CONSTRAINT "search_misses_term_direction_unique" UNIQUE("term","direction")
);
--> statement-breakpoint
ALTER TABLE "words" ALTER COLUMN "status" SET DEFAULT 'draft';--> statement-breakpoint
ALTER TABLE "contributions" ADD COLUMN "status" varchar(30) DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "examples" ADD COLUMN "status" varchar(30) DEFAULT 'published' NOT NULL;--> statement-breakpoint
ALTER TABLE "examples" ADD COLUMN "is_verified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "examples" ADD COLUMN "is_corrected" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "pronunciations" ADD COLUMN "status" varchar(30) DEFAULT 'published' NOT NULL;--> statement-breakpoint
ALTER TABLE "pronunciations" ADD COLUMN "is_verified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "pronunciations" ADD COLUMN "is_corrected" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "word_images" ADD COLUMN "status" varchar(30) DEFAULT 'published' NOT NULL;--> statement-breakpoint
ALTER TABLE "word_images" ADD COLUMN "is_verified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "word_images" ADD COLUMN "is_corrected" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "words" ADD COLUMN "is_corrected" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "search_misses" ADD CONSTRAINT "search_misses_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contributions_status_idx" ON "contributions" USING btree ("status");--> statement-breakpoint
-- Backfill (Section 22 approval gate): kontribsi lama sudah live sebagai
-- konten published — jangan biarkan membanjiri antrean review sebagai pending
UPDATE "contributions" SET "status" = 'approved';