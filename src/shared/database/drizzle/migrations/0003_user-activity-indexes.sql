CREATE INDEX `votes_user_id_id_idx` ON `votes` (`user_id`,`id`);--> statement-breakpoint
CREATE INDEX `comments_user_status_id_idx` ON `comments` (`user_id`,`status`,`id`);
