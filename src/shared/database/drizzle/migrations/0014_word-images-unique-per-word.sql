DROP INDEX IF EXISTS `word_images_file_unique`;--> statement-breakpoint
CREATE UNIQUE INDEX `word_images_word_file_unique` ON `word_images` (`word_id`,`provider`,`provider_file_id`);
