CREATE TABLE `word_import_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`triggered_by` text NOT NULL,
	`attributed_to` text NOT NULL,
	`source_label` text,
	`status` text NOT NULL,
	`total` integer DEFAULT 0 NOT NULL,
	`created_count` integer DEFAULT 0 NOT NULL,
	`duplicates_count` integer DEFAULT 0 NOT NULL,
	`meanings_added_count` integer DEFAULT 0 NOT NULL,
	`invalid_count` integer DEFAULT 0 NOT NULL,
	`items_json` text DEFAULT '[]' NOT NULL,
	`created_at` integer NOT NULL,
	`finished_at` integer,
	FOREIGN KEY (`triggered_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`attributed_to`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);--> statement-breakpoint
CREATE INDEX `word_import_sessions_finished_id_idx` ON `word_import_sessions` (`finished_at`,`id`);
