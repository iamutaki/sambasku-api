ALTER TABLE `users` ADD `can_contribute` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `word_edit_suggestions` ADD `baseline_snapshot` text;--> statement-breakpoint
UPDATE `words` SET `status` = 'published' WHERE `status` = 'pending_review' AND `deleted_at` IS NULL AND `created_by` != '01ANONIM000000000000000000';--> statement-breakpoint
UPDATE `pronunciations` SET `status` = 'published' WHERE `status` = 'pending_review' AND `created_by` != '01ANONIM000000000000000000';--> statement-breakpoint
UPDATE `word_images` SET `status` = 'published' WHERE `status` = 'pending_review' AND `created_by` != '01ANONIM000000000000000000';--> statement-breakpoint
UPDATE `word_audios` SET `status` = 'published' WHERE `status` = 'pending_review' AND `created_by` != '01ANONIM000000000000000000';--> statement-breakpoint
UPDATE `examples` SET `status` = 'published' WHERE `status` = 'pending_review' AND `created_by` != '01ANONIM000000000000000000';--> statement-breakpoint
UPDATE `meanings` SET `status` = 'published' WHERE `status` = 'pending_review' AND `created_by` != '01ANONIM000000000000000000';
