ALTER TABLE `words` ADD `lemma_allows_comma` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `meaning_translations` ADD `translation_allows_comma` integer DEFAULT 0 NOT NULL;
