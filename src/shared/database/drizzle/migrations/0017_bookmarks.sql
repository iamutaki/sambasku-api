CREATE TABLE "bookmarks" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"user_id" varchar(26) NOT NULL,
	"word_id" varchar(26) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contributions" ADD COLUMN "search_miss_id" varchar(26);--> statement-breakpoint
ALTER TABLE "search_misses" ADD COLUMN "is_visible" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "phone" varchar(20);--> statement-breakpoint
ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_word_id_words_id_fk" FOREIGN KEY ("word_id") REFERENCES "public"."words"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bookmarks_user_word_unique" ON "bookmarks" USING btree ("user_id","word_id");--> statement-breakpoint
CREATE INDEX "bookmarks_user_id_id_idx" ON "bookmarks" USING btree ("user_id","id");--> statement-breakpoint
ALTER TABLE "contributions" ADD CONSTRAINT "contributions_search_miss_id_search_misses_id_fk" FOREIGN KEY ("search_miss_id") REFERENCES "public"."search_misses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contributions_search_miss_idx" ON "contributions" USING btree ("search_miss_id");