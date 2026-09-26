ALTER TABLE `votes` ADD `client_id` text;--> statement-breakpoint
CREATE INDEX `votes_client_id_idx` ON `votes` (`client_id`);
