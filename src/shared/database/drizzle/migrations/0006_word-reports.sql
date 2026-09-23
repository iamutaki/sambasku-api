ALTER TABLE `words` ADD `takedown_reason_code` text;--> statement-breakpoint
ALTER TABLE `words` ADD `takedown_note` text;--> statement-breakpoint
ALTER TABLE `words` ADD `taken_down_by` text REFERENCES `users`(`id`);--> statement-breakpoint
ALTER TABLE `words` ADD `taken_down_at` integer;--> statement-breakpoint
CREATE TABLE `word_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`word_id` text NOT NULL,
	`user_id` text NOT NULL,
	`reason_code` text NOT NULL,
	`note` text,
	`status` text NOT NULL DEFAULT 'open',
	`resolution` text,
	`resolution_note` text,
	`resolved_by` text,
	`resolved_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer,
	FOREIGN KEY (`word_id`) REFERENCES `words`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`resolved_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `word_reports_status_id_idx` ON `word_reports` (`status`,`id`);--> statement-breakpoint
CREATE INDEX `word_reports_word_id_idx` ON `word_reports` (`word_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `word_reports_open_user_word_idx` ON `word_reports` (`word_id`,`user_id`) WHERE `status` = 'open';
