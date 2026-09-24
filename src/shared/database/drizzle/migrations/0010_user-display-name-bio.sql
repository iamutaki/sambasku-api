ALTER TABLE `users` ADD `display_name` text NOT NULL DEFAULT '';--> statement-breakpoint
UPDATE `users` SET `display_name` = `username` WHERE `display_name` = '' OR `display_name` IS NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `bio` text;
