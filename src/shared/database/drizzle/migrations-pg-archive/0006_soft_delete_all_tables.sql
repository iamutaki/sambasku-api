ALTER TABLE "categories" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "deleted_by" varchar(26);--> statement-breakpoint
ALTER TABLE "contribution_reviews" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "contribution_reviews" ADD COLUMN "deleted_by" varchar(26);--> statement-breakpoint
ALTER TABLE "contributions" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "contributions" ADD COLUMN "deleted_by" varchar(26);--> statement-breakpoint
ALTER TABLE "dialects" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "dialects" ADD COLUMN "deleted_by" varchar(26);--> statement-breakpoint
ALTER TABLE "languages" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "languages" ADD COLUMN "deleted_by" varchar(26);--> statement-breakpoint
ALTER TABLE "lexical_relations" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "lexical_relations" ADD COLUMN "deleted_by" varchar(26);--> statement-breakpoint
ALTER TABLE "word_categories" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "word_classes" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "word_classes" ADD COLUMN "deleted_by" varchar(26);--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contribution_reviews" ADD CONSTRAINT "contribution_reviews_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contributions" ADD CONSTRAINT "contributions_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dialects" ADD CONSTRAINT "dialects_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "languages" ADD CONSTRAINT "languages_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lexical_relations" ADD CONSTRAINT "lexical_relations_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "word_classes" ADD CONSTRAINT "word_classes_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;