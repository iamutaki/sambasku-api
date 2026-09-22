CREATE TABLE `word_audios` (
	`id` text PRIMARY KEY NOT NULL,
	`word_id` text NOT NULL,
	`example_id` text,
	`dialect_id` text,
	`provider` text NOT NULL DEFAULT 'github',
	`provider_file_id` text NOT NULL,
	`sha` text,
	`url` text NOT NULL,
	`mime_type` text NOT NULL,
	`file_size` integer NOT NULL,
	`duration_ms` integer,
	`speaker_name` text,
	`is_primary` integer NOT NULL DEFAULT false,
	`status` text NOT NULL DEFAULT 'published',
	`is_verified` integer NOT NULL DEFAULT false,
	`is_corrected` integer NOT NULL DEFAULT false,
	`created_by` text,
	`created_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`word_id`) REFERENCES `words`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`example_id`) REFERENCES `examples`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`dialect_id`) REFERENCES `dialects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `word_audios_file_unique` ON `word_audios` (`provider`,`provider_file_id`);--> statement-breakpoint
CREATE INDEX `word_audios_word_idx` ON `word_audios` (`word_id`);--> statement-breakpoint
CREATE INDEX `word_audios_example_idx` ON `word_audios` (`example_id`);
