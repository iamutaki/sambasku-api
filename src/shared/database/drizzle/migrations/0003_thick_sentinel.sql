CREATE TABLE "word_images" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"word_id" varchar(26) NOT NULL,
	"provider" varchar(50) DEFAULT 'imagekit' NOT NULL,
	"provider_file_id" varchar(255) NOT NULL,
	"url" varchar(1000) NOT NULL,
	"alt_text" varchar(500),
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_by" varchar(26),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "word_images_file_unique" UNIQUE("provider","provider_file_id")
);
--> statement-breakpoint
ALTER TABLE "word_images" ADD CONSTRAINT "word_images_word_id_words_id_fk" FOREIGN KEY ("word_id") REFERENCES "public"."words"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "word_images" ADD CONSTRAINT "word_images_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "word_images_word_idx" ON "word_images" USING btree ("word_id");