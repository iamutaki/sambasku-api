-- Post-moderation komentar + blocklist (09 / 10)
UPDATE `comments` SET `status` = 'published' WHERE `status` = 'pending_review';--> statement-breakpoint
UPDATE `comments` SET `status` = 'taken_down' WHERE `status` = 'rejected';--> statement-breakpoint
CREATE TABLE `comment_blocklist_words` (
	`id` text PRIMARY KEY NOT NULL,
	`word` text NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer,
	`deleted_at` integer,
	`deleted_by` text,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`deleted_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `comment_blocklist_words_word_idx` ON `comment_blocklist_words` (`word`);--> statement-breakpoint
CREATE INDEX `comment_blocklist_words_id_idx` ON `comment_blocklist_words` (`id`);
