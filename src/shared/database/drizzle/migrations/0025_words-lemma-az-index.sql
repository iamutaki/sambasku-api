CREATE TABLE "word_edit_suggestions" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"user_id" varchar(26) NOT NULL,
	"word_id" varchar(26) NOT NULL,
	"proposed_changes" json NOT NULL,
	"reason" text NOT NULL,
	"reason_code" varchar(40) DEFAULT 'other' NOT NULL,
	"status" varchar(30) DEFAULT 'pending' NOT NULL,
	"reviewed_by" varchar(26),
	"reviewed_at" timestamp,
	"review_comment" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp,
	"deleted_at" timestamp,
	"deleted_by" varchar(26)
);
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD COLUMN "source_contribution_id" varchar(26);--> statement-breakpoint
ALTER TABLE "dialects" ADD COLUMN "is_default" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "meanings" ADD COLUMN "is_have_definition" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "meanings" ADD COLUMN "is_have_translation" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "meanings" ADD COLUMN "status" varchar(30) DEFAULT 'published' NOT NULL;--> statement-breakpoint
ALTER TABLE "meanings" ADD COLUMN "is_verified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "meanings" ADD COLUMN "is_corrected" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "word_edit_suggestions" ADD CONSTRAINT "word_edit_suggestions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "word_edit_suggestions" ADD CONSTRAINT "word_edit_suggestions_word_id_words_id_fk" FOREIGN KEY ("word_id") REFERENCES "public"."words"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "word_edit_suggestions" ADD CONSTRAINT "word_edit_suggestions_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "word_edit_suggestions" ADD CONSTRAINT "word_edit_suggestions_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "suggestions_word_status_idx" ON "word_edit_suggestions" USING btree ("word_id","status");--> statement-breakpoint
CREATE INDEX "suggestions_user_created_idx" ON "word_edit_suggestions" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "suggestions_status_created_idx" ON "word_edit_suggestions" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "suggestions_reason_code_idx" ON "word_edit_suggestions" USING btree ("reason_code");--> statement-breakpoint
CREATE INDEX "audit_logs_source_contribution_idx" ON "audit_logs" USING btree ("source_contribution_id");--> statement-breakpoint
CREATE INDEX "meanings_word_status_idx" ON "meanings" USING btree ("word_id","status");--> statement-breakpoint
CREATE INDEX "words_lemma_az_idx" ON "words" USING btree (lower("lemma") COLLATE "C","id");