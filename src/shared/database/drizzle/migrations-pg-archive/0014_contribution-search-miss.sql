ALTER TABLE "contributions" ADD COLUMN "search_miss_id" varchar(26);--> statement-breakpoint
ALTER TABLE "contributions" ADD CONSTRAINT "contributions_search_miss_id_search_misses_id_fk" FOREIGN KEY ("search_miss_id") REFERENCES "public"."search_misses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contributions_search_miss_idx" ON "contributions" USING btree ("search_miss_id");
