CREATE TABLE "word_variants" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"word_id" varchar(26) NOT NULL,
	"form" varchar(255) NOT NULL,
	"variant_type" varchar(50) DEFAULT 'alternative' NOT NULL,
	"affix_type" varchar(30),
	"affix_value" varchar(50),
	"dialect_id" varchar(26),
	"notes" text,
	"created_by" varchar(26),
	"updated_by" varchar(26),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp,
	"deleted_at" timestamp,
	"deleted_by" varchar(26),
	CONSTRAINT "word_variants_unique" UNIQUE("word_id","form","dialect_id")
);
--> statement-breakpoint
ALTER TABLE "words" ADD COLUMN "word_type" varchar(30) DEFAULT 'word' NOT NULL;--> statement-breakpoint
ALTER TABLE "word_variants" ADD CONSTRAINT "word_variants_word_id_words_id_fk" FOREIGN KEY ("word_id") REFERENCES "public"."words"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "word_variants" ADD CONSTRAINT "word_variants_dialect_id_dialects_id_fk" FOREIGN KEY ("dialect_id") REFERENCES "public"."dialects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "word_variants" ADD CONSTRAINT "word_variants_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "word_variants" ADD CONSTRAINT "word_variants_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "word_variants" ADD CONSTRAINT "word_variants_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "word_variants_word_idx" ON "word_variants" USING btree ("word_id");--> statement-breakpoint
CREATE INDEX "lexical_relations_target_idx" ON "lexical_relations" USING btree ("target_word_id");