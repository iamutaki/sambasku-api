ALTER TABLE "words" ALTER COLUMN "status" SET DEFAULT 'published';--> statement-breakpoint
ALTER TABLE "words" ADD COLUMN "is_verified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "words" ADD COLUMN "verified_by" varchar(26);--> statement-breakpoint
ALTER TABLE "words" ADD COLUMN "verified_at" timestamp;--> statement-breakpoint
ALTER TABLE "words" ADD CONSTRAINT "words_verified_by_users_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;