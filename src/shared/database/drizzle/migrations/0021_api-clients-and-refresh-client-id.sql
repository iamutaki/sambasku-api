CREATE TABLE `api_clients` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`client_secret_hash` text,
	`name` text NOT NULL,
	`description` text,
	`owner_user_id` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`is_first_party` integer DEFAULT false NOT NULL,
	`homepage_url` text,
	`privacy_url` text,
	`redirect_uris` text DEFAULT '[]' NOT NULL,
	`allowed_scopes` text DEFAULT '[]' NOT NULL,
	`allowed_channels` text DEFAULT '[]' NOT NULL,
	`rate_limit_tier` text DEFAULT 'standard' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);--> statement-breakpoint
CREATE UNIQUE INDEX `api_clients_client_id_unique` ON `api_clients` (`client_id`);--> statement-breakpoint
CREATE INDEX `api_clients_status_idx` ON `api_clients` (`status`);--> statement-breakpoint
CREATE INDEX `api_clients_owner_idx` ON `api_clients` (`owner_user_id`);--> statement-breakpoint
ALTER TABLE `refresh_tokens` ADD `client_id` text;--> statement-breakpoint
CREATE INDEX `refresh_tokens_client_id_idx` ON `refresh_tokens` (`client_id`);--> statement-breakpoint
INSERT INTO `api_clients` (
	`id`, `client_id`, `client_secret_hash`, `name`, `description`, `owner_user_id`,
	`status`, `is_first_party`, `homepage_url`, `privacy_url`, `redirect_uris`,
	`allowed_scopes`, `allowed_channels`, `rate_limit_tier`, `created_at`, `updated_at`
) VALUES
(
	'01APICLIENTMOBILE000000001',
	'sambasku-mobile',
	NULL,
	'SambasKu Mobile',
	'Aplikasi resmi Android/iOS',
	NULL,
	'approved',
	1,
	'https://sambasku.com',
	'https://sambasku.com/privacy-policy',
	'[]',
	'["vote.write","comment.write","contribute.write","translation_help.write","bookmark.write","profile.read","device.write"]',
	'["mobile"]',
	'first_party',
	unixepoch() * 1000,
	NULL
),
(
	'01APICLIENTWEB00000000001',
	'sambasku-web',
	NULL,
	'SambasKu Web',
	'Situs publik resmi',
	NULL,
	'approved',
	1,
	'https://sambasku.com',
	'https://sambasku.com/privacy-policy',
	'[]',
	'["vote.write","comment.write","contribute.write","translation_help.write","bookmark.write","profile.read","device.write"]',
	'["web"]',
	'first_party',
	unixepoch() * 1000,
	NULL
),
(
	'01APICLIENTCONSOLE00000001',
	'sambasku-console',
	NULL,
	'SambasKu Console',
	'Panel admin resmi',
	NULL,
	'approved',
	1,
	'https://console.sambasku.com',
	'https://sambasku.com/privacy-policy',
	'[]',
	'["vote.write","comment.write","contribute.write","translation_help.write","bookmark.write","profile.read","device.write"]',
	'["web"]',
	'first_party',
	unixepoch() * 1000,
	NULL
);
