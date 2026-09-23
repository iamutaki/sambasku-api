CREATE TABLE `account_deletion_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`is_used` integer DEFAULT false NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `account_deletion_tokens_token_hash_unique` ON `account_deletion_tokens` (`token_hash`);--> statement-breakpoint
CREATE INDEX `account_deletion_tokens_user_id_idx` ON `account_deletion_tokens` (`user_id`);
