ALTER TABLE `word_reports` ADD `image_id` text REFERENCES `word_images`(`id`);--> statement-breakpoint
DROP INDEX IF EXISTS `word_reports_open_user_word_idx`;--> statement-breakpoint
CREATE UNIQUE INDEX `word_reports_open_user_word_idx`
  ON `word_reports` (`word_id`, `user_id`)
  WHERE `status` = 'open' AND `image_id` IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `word_reports_open_user_word_image_idx`
  ON `word_reports` (`word_id`, `user_id`, `image_id`)
  WHERE `status` = 'open' AND `image_id` IS NOT NULL;
