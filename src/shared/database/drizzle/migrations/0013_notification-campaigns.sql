CREATE TABLE `notification_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`deep_link_kind` text DEFAULT 'none' NOT NULL,
	`deep_link_value` text,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer,
	`deleted_at` integer,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);--> statement-breakpoint
CREATE INDEX `notification_templates_active_created_at_idx` ON `notification_templates` (`created_at`) WHERE deleted_at is null;--> statement-breakpoint
CREATE TABLE `notification_campaigns` (
	`id` text PRIMARY KEY NOT NULL,
	`template_id` text,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`deep_link_kind` text DEFAULT 'none' NOT NULL,
	`deep_link_value` text,
	`audience_type` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`send_at` integer,
	`targeted_users` integer DEFAULT 0 NOT NULL,
	`push_success` integer DEFAULT 0 NOT NULL,
	`push_failed` integer DEFAULT 0 NOT NULL,
	`inbox_written` integer DEFAULT 0 NOT NULL,
	`inbox_cursor` text,
	`topic_sent` integer DEFAULT false NOT NULL,
	`last_error` text,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer,
	FOREIGN KEY (`template_id`) REFERENCES `notification_templates`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);--> statement-breakpoint
CREATE INDEX `notification_campaigns_status_send_at_idx` ON `notification_campaigns` (`status`,`send_at`);--> statement-breakpoint
CREATE INDEX `notification_campaigns_created_at_idx` ON `notification_campaigns` (`created_at`);--> statement-breakpoint
CREATE TABLE `notification_campaign_recipients` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`user_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer,
	FOREIGN KEY (`campaign_id`) REFERENCES `notification_campaigns`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);--> statement-breakpoint
CREATE UNIQUE INDEX `notification_campaign_recipients_campaign_user_unique` ON `notification_campaign_recipients` (`campaign_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `notification_campaign_recipients_pending_idx` ON `notification_campaign_recipients` (`campaign_id`,`status`);
