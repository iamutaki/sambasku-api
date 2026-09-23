CREATE TABLE "categories" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"parent_id" varchar(26),
	"name" varchar(100) NOT NULL,
	"description" varchar(500),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "contribution_reviews" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"contribution_id" varchar(26) NOT NULL,
	"reviewer_id" varchar(26),
	"status" varchar(30) DEFAULT 'pending' NOT NULL,
	"comment" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contributions" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"user_id" varchar(26) NOT NULL,
	"entity_type" varchar(50) NOT NULL,
	"entity_id" varchar(26) NOT NULL,
	"action" varchar(50) NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dialects" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"language_id" varchar(26) NOT NULL,
	"code" varchar(50) NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" varchar(500),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp,
	CONSTRAINT "dialects_language_code_unique" UNIQUE("language_id","code")
);
--> statement-breakpoint
CREATE TABLE "examples" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"meaning_id" varchar(26) NOT NULL,
	"source_language_id" varchar(26) NOT NULL,
	"source_sentence" text NOT NULL,
	"target_language_id" varchar(26),
	"target_sentence" text,
	"source_type" varchar(50),
	"source_reference" text,
	"notes" text,
	"created_by" varchar(26),
	"updated_by" varchar(26),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp,
	"deleted_at" timestamp,
	"deleted_by" varchar(26)
);
--> statement-breakpoint
CREATE TABLE "languages" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"code" varchar(20) NOT NULL,
	"name" varchar(100) NOT NULL,
	"native_name" varchar(100),
	"description" varchar(500),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp,
	CONSTRAINT "languages_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "lexical_relations" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"source_word_id" varchar(26) NOT NULL,
	"target_word_id" varchar(26) NOT NULL,
	"relation_type" varchar(50) NOT NULL,
	"notes" text,
	"created_by" varchar(26),
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "lexical_relations_unique" UNIQUE("source_word_id","target_word_id","relation_type")
);
--> statement-breakpoint
CREATE TABLE "meaning_translations" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"meaning_id" varchar(26) NOT NULL,
	"language_id" varchar(26) NOT NULL,
	"translation_text" text NOT NULL,
	"translation_type" varchar(50) DEFAULT 'direct' NOT NULL,
	"notes" text,
	"created_by" varchar(26),
	"updated_by" varchar(26),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp,
	"deleted_at" timestamp,
	CONSTRAINT "meaning_translations_unique" UNIQUE("meaning_id","language_id","translation_text")
);
--> statement-breakpoint
CREATE TABLE "meanings" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"word_id" varchar(26) NOT NULL,
	"word_class_id" varchar(26),
	"definition" text NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"created_by" varchar(26),
	"updated_by" varchar(26),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp,
	"deleted_at" timestamp,
	"deleted_by" varchar(26)
);
--> statement-breakpoint
CREATE TABLE "pronunciations" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"word_id" varchar(26) NOT NULL,
	"dialect_id" varchar(26),
	"notation" varchar(50) DEFAULT 'ipa' NOT NULL,
	"value" varchar(500) NOT NULL,
	"audio_url" text,
	"speaker_name" varchar(255),
	"notes" text,
	"created_by" varchar(26),
	"updated_by" varchar(26),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp,
	"deleted_at" timestamp,
	"deleted_by" varchar(26),
	CONSTRAINT "pronunciations_unique" UNIQUE("word_id","dialect_id","notation","value")
);
--> statement-breakpoint
CREATE TABLE "word_categories" (
	"word_id" varchar(26) NOT NULL,
	"category_id" varchar(26) NOT NULL,
	CONSTRAINT "word_categories_word_id_category_id_pk" PRIMARY KEY("word_id","category_id")
);
--> statement-breakpoint
CREATE TABLE "word_classes" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"parent_id" varchar(26),
	"code" varchar(50) NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" varchar(500),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp,
	CONSTRAINT "word_classes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "words" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"language_id" varchar(26) NOT NULL,
	"lemma" varchar(255) NOT NULL,
	"notes" text,
	"status" varchar(30) DEFAULT 'draft' NOT NULL,
	"created_by" varchar(26),
	"updated_by" varchar(26),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp,
	"deleted_at" timestamp,
	"deleted_by" varchar(26)
);
--> statement-breakpoint
ALTER TABLE "contribution_reviews" ADD CONSTRAINT "contribution_reviews_contribution_id_contributions_id_fk" FOREIGN KEY ("contribution_id") REFERENCES "public"."contributions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contribution_reviews" ADD CONSTRAINT "contribution_reviews_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contributions" ADD CONSTRAINT "contributions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dialects" ADD CONSTRAINT "dialects_language_id_languages_id_fk" FOREIGN KEY ("language_id") REFERENCES "public"."languages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "examples" ADD CONSTRAINT "examples_meaning_id_meanings_id_fk" FOREIGN KEY ("meaning_id") REFERENCES "public"."meanings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "examples" ADD CONSTRAINT "examples_source_language_id_languages_id_fk" FOREIGN KEY ("source_language_id") REFERENCES "public"."languages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "examples" ADD CONSTRAINT "examples_target_language_id_languages_id_fk" FOREIGN KEY ("target_language_id") REFERENCES "public"."languages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "examples" ADD CONSTRAINT "examples_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "examples" ADD CONSTRAINT "examples_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "examples" ADD CONSTRAINT "examples_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lexical_relations" ADD CONSTRAINT "lexical_relations_source_word_id_words_id_fk" FOREIGN KEY ("source_word_id") REFERENCES "public"."words"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lexical_relations" ADD CONSTRAINT "lexical_relations_target_word_id_words_id_fk" FOREIGN KEY ("target_word_id") REFERENCES "public"."words"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lexical_relations" ADD CONSTRAINT "lexical_relations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meaning_translations" ADD CONSTRAINT "meaning_translations_meaning_id_meanings_id_fk" FOREIGN KEY ("meaning_id") REFERENCES "public"."meanings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meaning_translations" ADD CONSTRAINT "meaning_translations_language_id_languages_id_fk" FOREIGN KEY ("language_id") REFERENCES "public"."languages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meaning_translations" ADD CONSTRAINT "meaning_translations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meaning_translations" ADD CONSTRAINT "meaning_translations_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meanings" ADD CONSTRAINT "meanings_word_id_words_id_fk" FOREIGN KEY ("word_id") REFERENCES "public"."words"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meanings" ADD CONSTRAINT "meanings_word_class_id_word_classes_id_fk" FOREIGN KEY ("word_class_id") REFERENCES "public"."word_classes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meanings" ADD CONSTRAINT "meanings_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meanings" ADD CONSTRAINT "meanings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meanings" ADD CONSTRAINT "meanings_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pronunciations" ADD CONSTRAINT "pronunciations_word_id_words_id_fk" FOREIGN KEY ("word_id") REFERENCES "public"."words"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pronunciations" ADD CONSTRAINT "pronunciations_dialect_id_dialects_id_fk" FOREIGN KEY ("dialect_id") REFERENCES "public"."dialects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pronunciations" ADD CONSTRAINT "pronunciations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pronunciations" ADD CONSTRAINT "pronunciations_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pronunciations" ADD CONSTRAINT "pronunciations_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "word_categories" ADD CONSTRAINT "word_categories_word_id_words_id_fk" FOREIGN KEY ("word_id") REFERENCES "public"."words"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "word_categories" ADD CONSTRAINT "word_categories_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "words" ADD CONSTRAINT "words_language_id_languages_id_fk" FOREIGN KEY ("language_id") REFERENCES "public"."languages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "words" ADD CONSTRAINT "words_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "words" ADD CONSTRAINT "words_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "words" ADD CONSTRAINT "words_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contribution_reviews_contribution_reviewer_idx" ON "contribution_reviews" USING btree ("contribution_id","reviewer_id");--> statement-breakpoint
CREATE INDEX "contributions_user_created_idx" ON "contributions" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "contributions_entity_idx" ON "contributions" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "meanings_word_order_idx" ON "meanings" USING btree ("word_id","order_index");--> statement-breakpoint
CREATE INDEX "words_language_lemma_idx" ON "words" USING btree ("language_id","lemma");