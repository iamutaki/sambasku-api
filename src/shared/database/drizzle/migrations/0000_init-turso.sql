CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`old_data` text,
	`new_data` text,
	`request_id` text,
	`created_at` integer NOT NULL,
	`source_contribution_id` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `audit_logs_entity_created_idx` ON `audit_logs` (`entity_type`,`entity_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `audit_logs_user_created_idx` ON `audit_logs` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `audit_logs_request_id_idx` ON `audit_logs` (`request_id`);--> statement-breakpoint
CREATE INDEX `audit_logs_source_contribution_idx` ON `audit_logs` (`source_contribution_id`);--> statement-breakpoint
CREATE TABLE `auth_identities` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`provider` text NOT NULL,
	`provider_user_id` text NOT NULL,
	`email_at_provider` text,
	`created_at` integer NOT NULL,
	`deleted_at` integer,
	`deleted_by` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`deleted_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `auth_identities_user_idx` ON `auth_identities` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `auth_identities_provider_uid_unique` ON `auth_identities` (`provider`,`provider_user_id`);--> statement-breakpoint
CREATE TABLE `bookmarks` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`word_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`word_id`) REFERENCES `words`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bookmarks_user_word_unique` ON `bookmarks` (`user_id`,`word_id`);--> statement-breakpoint
CREATE INDEX `bookmarks_user_id_id_idx` ON `bookmarks` (`user_id`,`id`);--> statement-breakpoint
CREATE TABLE `bug_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`device_id` text,
	`description` text NOT NULL,
	`images` text NOT NULL,
	`app_version` text,
	`platform` text,
	`status` text DEFAULT 'open' NOT NULL,
	`resolution_note` text,
	`resolved_by` text,
	`resolved_at` integer,
	`created_by` text,
	`updated_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer,
	`deleted_at` integer,
	`deleted_by` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`resolved_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`deleted_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `bug_reports_status_id_idx` ON `bug_reports` (`status`,`id`);--> statement-breakpoint
CREATE INDEX `bug_reports_user_id_idx` ON `bug_reports` (`user_id`);--> statement-breakpoint
CREATE INDEX `bug_reports_device_id_idx` ON `bug_reports` (`device_id`);--> statement-breakpoint
CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`parent_id` text,
	`name` text NOT NULL,
	`description` text,
	`created_at` integer NOT NULL,
	`updated_at` integer,
	`deleted_at` integer,
	`deleted_by` text,
	FOREIGN KEY (`deleted_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `categories_active_name_idx` ON `categories` (`name`) WHERE deleted_at is null;--> statement-breakpoint
CREATE TABLE `comments` (
	`id` text PRIMARY KEY NOT NULL,
	`word_id` text NOT NULL,
	`user_id` text NOT NULL,
	`body` text NOT NULL,
	`status` text DEFAULT 'pending_review' NOT NULL,
	`reviewed_by` text,
	`reviewed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer,
	`deleted_at` integer,
	`deleted_by` text,
	FOREIGN KEY (`word_id`) REFERENCES `words`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reviewed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`deleted_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `comments_word_status_idx` ON `comments` (`word_id`,`status`,`id`);--> statement-breakpoint
CREATE INDEX `comments_status_idx` ON `comments` (`status`,`id`);--> statement-breakpoint
CREATE TABLE `contribution_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`contribution_id` text NOT NULL,
	`reviewer_id` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`comment` text,
	`deleted_at` integer,
	`deleted_by` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`contribution_id`) REFERENCES `contributions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reviewer_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`deleted_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `contribution_reviews_contribution_reviewer_idx` ON `contribution_reviews` (`contribution_id`,`reviewer_id`);--> statement-breakpoint
CREATE TABLE `contributions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`action` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`description` text,
	`search_miss_id` text,
	`created_at` integer NOT NULL,
	`deleted_at` integer,
	`deleted_by` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`search_miss_id`) REFERENCES `search_misses`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`deleted_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `contributions_user_created_idx` ON `contributions` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `contributions_entity_idx` ON `contributions` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE INDEX `contributions_status_idx` ON `contributions` (`status`);--> statement-breakpoint
CREATE INDEX `contributions_search_miss_idx` ON `contributions` (`search_miss_id`);--> statement-breakpoint
CREATE TABLE `device_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`udid` text NOT NULL,
	`fcm_token` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer,
	`deleted_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `device_tokens_udid_unique` ON `device_tokens` (`udid`);--> statement-breakpoint
CREATE UNIQUE INDEX `device_tokens_active_fcm_token_idx` ON `device_tokens` (`fcm_token`) WHERE deleted_at is null;--> statement-breakpoint
CREATE INDEX `device_tokens_active_user_id_idx` ON `device_tokens` (`user_id`) WHERE deleted_at is null;--> statement-breakpoint
CREATE TABLE `dialects` (
	`id` text PRIMARY KEY NOT NULL,
	`language_id` text NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`is_active` integer DEFAULT true NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer,
	`deleted_at` integer,
	`deleted_by` text,
	FOREIGN KEY (`language_id`) REFERENCES `languages`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`deleted_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `dialects_one_default_per_language_idx` ON `dialects` (`language_id`) WHERE is_default = 1 and deleted_at is null;--> statement-breakpoint
CREATE UNIQUE INDEX `dialects_language_code_unique` ON `dialects` (`language_id`,`code`);--> statement-breakpoint
CREATE TABLE `email_verification_otps` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`code_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `email_verification_otps_user_idx` ON `email_verification_otps` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `email_verification_otps_user_unique` ON `email_verification_otps` (`user_id`);--> statement-breakpoint
CREATE TABLE `examples` (
	`id` text PRIMARY KEY NOT NULL,
	`meaning_id` text NOT NULL,
	`source_language_id` text NOT NULL,
	`source_sentence` text NOT NULL,
	`target_language_id` text,
	`target_sentence` text,
	`source_type` text,
	`source_reference` text,
	`notes` text,
	`status` text DEFAULT 'published' NOT NULL,
	`is_verified` integer DEFAULT false NOT NULL,
	`is_corrected` integer DEFAULT false NOT NULL,
	`created_by` text,
	`updated_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer,
	`deleted_at` integer,
	`deleted_by` text,
	FOREIGN KEY (`meaning_id`) REFERENCES `meanings`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_language_id`) REFERENCES `languages`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`target_language_id`) REFERENCES `languages`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`deleted_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `languages` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`native_name` text,
	`description` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer,
	`deleted_at` integer,
	`deleted_by` text,
	FOREIGN KEY (`deleted_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `languages_code_unique` ON `languages` (`code`);--> statement-breakpoint
CREATE TABLE `lexical_relations` (
	`id` text PRIMARY KEY NOT NULL,
	`source_word_id` text NOT NULL,
	`target_word_id` text NOT NULL,
	`relation_type` text NOT NULL,
	`notes` text,
	`created_by` text,
	`deleted_at` integer,
	`deleted_by` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`source_word_id`) REFERENCES `words`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`target_word_id`) REFERENCES `words`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`deleted_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `lexical_relations_target_idx` ON `lexical_relations` (`target_word_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `lexical_relations_unique` ON `lexical_relations` (`source_word_id`,`target_word_id`,`relation_type`);--> statement-breakpoint
CREATE TABLE `meaning_translations` (
	`id` text PRIMARY KEY NOT NULL,
	`meaning_id` text NOT NULL,
	`language_id` text NOT NULL,
	`translation_text` text NOT NULL,
	`translation_type` text DEFAULT 'direct' NOT NULL,
	`notes` text,
	`created_by` text,
	`updated_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer,
	`deleted_at` integer,
	FOREIGN KEY (`meaning_id`) REFERENCES `meanings`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`language_id`) REFERENCES `languages`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `meaning_translations_unique` ON `meaning_translations` (`meaning_id`,`language_id`,`translation_text`);--> statement-breakpoint
CREATE TABLE `meanings` (
	`id` text PRIMARY KEY NOT NULL,
	`word_id` text NOT NULL,
	`word_class_id` text,
	`inherited_from_meaning_id` text,
	`definition` text NOT NULL,
	`is_have_definition` integer DEFAULT true NOT NULL,
	`is_have_translation` integer DEFAULT true NOT NULL,
	`order_index` integer DEFAULT 0 NOT NULL,
	`notes` text,
	`status` text DEFAULT 'published' NOT NULL,
	`is_verified` integer DEFAULT false NOT NULL,
	`is_corrected` integer DEFAULT false NOT NULL,
	`created_by` text,
	`updated_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer,
	`deleted_at` integer,
	`deleted_by` text,
	FOREIGN KEY (`word_id`) REFERENCES `words`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`word_class_id`) REFERENCES `word_classes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`inherited_from_meaning_id`) REFERENCES `meanings`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`deleted_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `meanings_word_order_idx` ON `meanings` (`word_id`,`order_index`);--> statement-breakpoint
CREATE INDEX `meanings_inherited_from_idx` ON `meanings` (`inherited_from_meaning_id`);--> statement-breakpoint
CREATE INDEX `meanings_word_status_idx` ON `meanings` (`word_id`,`status`);--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`target_kind` text NOT NULL,
	`target_id` text NOT NULL,
	`read_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notifications_user_target_unique` ON `notifications` (`user_id`,`target_kind`,`target_id`);--> statement-breakpoint
CREATE INDEX `notifications_user_id_id_idx` ON `notifications` (`user_id`,`id`);--> statement-breakpoint
CREATE INDEX `notifications_user_unread_idx` ON `notifications` (`user_id`) WHERE read_at is null;--> statement-breakpoint
CREATE TABLE `password_reset_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`is_used` integer DEFAULT false NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `password_reset_tokens_token_hash_unique` ON `password_reset_tokens` (`token_hash`);--> statement-breakpoint
CREATE INDEX `password_reset_tokens_user_id_idx` ON `password_reset_tokens` (`user_id`);--> statement-breakpoint
CREATE TABLE `pronunciations` (
	`id` text PRIMARY KEY NOT NULL,
	`word_id` text NOT NULL,
	`dialect_id` text,
	`notation` text DEFAULT 'ipa' NOT NULL,
	`value` text NOT NULL,
	`audio_url` text,
	`speaker_name` text,
	`notes` text,
	`status` text DEFAULT 'published' NOT NULL,
	`is_verified` integer DEFAULT false NOT NULL,
	`is_corrected` integer DEFAULT false NOT NULL,
	`created_by` text,
	`updated_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer,
	`deleted_at` integer,
	`deleted_by` text,
	FOREIGN KEY (`word_id`) REFERENCES `words`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`dialect_id`) REFERENCES `dialects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`deleted_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pronunciations_unique` ON `pronunciations` (`word_id`,`dialect_id`,`notation`,`value`);--> statement-breakpoint
CREATE TABLE `refresh_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`device_info` text,
	`ip_address` text,
	`is_revoked` integer DEFAULT false NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `refresh_tokens_token_hash_unique` ON `refresh_tokens` (`token_hash`);--> statement-breakpoint
CREATE INDEX `refresh_tokens_user_id_idx` ON `refresh_tokens` (`user_id`);--> statement-breakpoint
CREATE TABLE `search_misses` (
	`id` text PRIMARY KEY NOT NULL,
	`term` text NOT NULL,
	`direction` text DEFAULT 'lemma' NOT NULL,
	`hit_count` integer DEFAULT 1 NOT NULL,
	`last_searched_at` integer NOT NULL,
	`is_visible` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer,
	`deleted_at` integer,
	`deleted_by` text,
	FOREIGN KEY (`deleted_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `search_misses_term_direction_unique` ON `search_misses` (`term`,`direction`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`email` text NOT NULL,
	`phone` text,
	`password_hash` text,
	`role` text DEFAULT 'contributor' NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_phone_unique` ON `users` (`phone`) WHERE phone is not null;--> statement-breakpoint
CREATE TABLE `verifier_applications` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`phone` text NOT NULL,
	`address` text NOT NULL,
	`social_links` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`admin_comment` text,
	`reviewed_by` text,
	`reviewed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reviewed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `verifier_applications_user_id_unique` ON `verifier_applications` (`user_id`);--> statement-breakpoint
CREATE INDEX `verifier_applications_status_id_idx` ON `verifier_applications` (`status`,`id`);--> statement-breakpoint
CREATE TABLE `votes` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`value` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `votes_user_target_unique` ON `votes` (`user_id`,`entity_type`,`entity_id`);--> statement-breakpoint
CREATE INDEX `votes_target_idx` ON `votes` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE TABLE `word_categories` (
	`word_id` text NOT NULL,
	`deleted_at` integer,
	`category_id` text NOT NULL,
	PRIMARY KEY(`word_id`, `category_id`),
	FOREIGN KEY (`word_id`) REFERENCES `words`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `word_classes` (
	`id` text PRIMARY KEY NOT NULL,
	`parent_id` text,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`alias` text,
	`description` text,
	`created_at` integer NOT NULL,
	`deleted_at` integer,
	`deleted_by` text,
	`updated_at` integer,
	FOREIGN KEY (`deleted_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `word_classes_code_unique` ON `word_classes` (`code`);--> statement-breakpoint
CREATE TABLE `word_edit_suggestions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`word_id` text NOT NULL,
	`proposed_changes` text NOT NULL,
	`reason` text NOT NULL,
	`reason_code` text DEFAULT 'other' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`reviewed_by` text,
	`reviewed_at` integer,
	`review_comment` text,
	`created_at` integer NOT NULL,
	`updated_at` integer,
	`deleted_at` integer,
	`deleted_by` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`word_id`) REFERENCES `words`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reviewed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`deleted_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `suggestions_word_status_idx` ON `word_edit_suggestions` (`word_id`,`status`);--> statement-breakpoint
CREATE INDEX `suggestions_user_created_idx` ON `word_edit_suggestions` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `suggestions_status_created_idx` ON `word_edit_suggestions` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `suggestions_reason_code_idx` ON `word_edit_suggestions` (`reason_code`);--> statement-breakpoint
CREATE TABLE `word_images` (
	`id` text PRIMARY KEY NOT NULL,
	`word_id` text NOT NULL,
	`provider` text DEFAULT 'imagekit' NOT NULL,
	`provider_file_id` text NOT NULL,
	`url` text NOT NULL,
	`alt_text` text,
	`is_primary` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'published' NOT NULL,
	`is_verified` integer DEFAULT false NOT NULL,
	`is_corrected` integer DEFAULT false NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`word_id`) REFERENCES `words`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `word_images_word_idx` ON `word_images` (`word_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `word_images_file_unique` ON `word_images` (`provider`,`provider_file_id`);--> statement-breakpoint
CREATE TABLE `word_variants` (
	`id` text PRIMARY KEY NOT NULL,
	`word_id` text NOT NULL,
	`form` text NOT NULL,
	`variant_type` text DEFAULT 'alternative' NOT NULL,
	`affix_type` text,
	`affix_value` text,
	`dialect_id` text,
	`notes` text,
	`created_by` text,
	`updated_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer,
	`deleted_at` integer,
	`deleted_by` text,
	FOREIGN KEY (`word_id`) REFERENCES `words`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`dialect_id`) REFERENCES `dialects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`deleted_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `word_variants_word_idx` ON `word_variants` (`word_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `word_variants_unique` ON `word_variants` (`word_id`,`form`,`dialect_id`);--> statement-breakpoint
CREATE TABLE `words` (
	`id` text PRIMARY KEY NOT NULL,
	`language_id` text NOT NULL,
	`lemma` text NOT NULL,
	`notes` text,
	`word_type` text DEFAULT 'word' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`is_verified` integer DEFAULT false NOT NULL,
	`verified_by` text,
	`verified_at` integer,
	`is_corrected` integer DEFAULT false NOT NULL,
	`created_by` text,
	`updated_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer,
	`deleted_at` integer,
	`deleted_by` text,
	FOREIGN KEY (`language_id`) REFERENCES `languages`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`verified_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`deleted_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `words_language_lemma_idx` ON `words` (`language_id`,`lemma`);--> statement-breakpoint
CREATE INDEX `words_lemma_az_idx` ON `words` (lower("lemma"),`id`);