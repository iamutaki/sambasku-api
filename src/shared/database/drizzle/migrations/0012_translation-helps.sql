CREATE TABLE `translation_helps` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`body` text,
	`images` text NOT NULL,
	`status` text DEFAULT 'pending_review' NOT NULL,
	`rejection_note` text,
	`reviewed_by` text,
	`reviewed_at` integer,
	`pinned_reply_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reviewed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `translation_helps_status_id_idx` ON `translation_helps` (`status`,`id`);--> statement-breakpoint
CREATE INDEX `translation_helps_user_id_idx` ON `translation_helps` (`user_id`,`id`);--> statement-breakpoint
CREATE TABLE `translation_help_replies` (
	`id` text PRIMARY KEY NOT NULL,
	`help_id` text NOT NULL,
	`user_id` text NOT NULL,
	`body` text NOT NULL,
	`body_original` text,
	`status` text DEFAULT 'published' NOT NULL,
	`reviewed_by` text,
	`reviewed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer,
	FOREIGN KEY (`help_id`) REFERENCES `translation_helps`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reviewed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `translation_help_replies_help_created_idx` ON `translation_help_replies` (`help_id`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `translation_help_replies_status_idx` ON `translation_help_replies` (`status`,`id`);
