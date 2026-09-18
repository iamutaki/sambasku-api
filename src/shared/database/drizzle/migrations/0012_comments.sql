CREATE TABLE "comments" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"word_id" varchar(26) NOT NULL,
	"user_id" varchar(26) NOT NULL,
	"body" text NOT NULL,
	"status" varchar(30) DEFAULT 'pending_review' NOT NULL,
	"reviewed_by" varchar(26),
	"reviewed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp,
	"deleted_at" timestamp,
	"deleted_by" varchar(26)
);
--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_word_id_words_id_fk" FOREIGN KEY ("word_id") REFERENCES "public"."words"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "comments_word_status_idx" ON "comments" USING btree ("word_id","status","id");--> statement-breakpoint
CREATE INDEX "comments_status_idx" ON "comments" USING btree ("status","id");