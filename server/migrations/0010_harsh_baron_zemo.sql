-- M1: unique constraint on (user_id, valve_number) prevents duplicate default zones
--     from race conditions in ensureDefaultZones()
DROP INDEX IF EXISTS `irrigation_zone_user_valve_idx`;
--> statement-breakpoint
CREATE UNIQUE INDEX `irrigation_zone_user_valve_idx` ON `irrigation_zone` (`user_id`,`valve_number`);
--> statement-breakpoint

-- M6: add CHECK constraint on irrigation_command.status (pending/acked/done/failed).
--     SQLite requires full table recreation to add a constraint to an existing table.
CREATE TABLE `__new_irrigation_command` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`user_id` text NOT NULL,
	`zone_id` text,
	`zone_number` integer,
	`command` text NOT NULL,
	`duration_min` integer,
	`status` text DEFAULT 'pending' NOT NULL CHECK (`status` IN ('pending', 'acked', 'done', 'failed')),
	`requested_by` text,
	`requested_at` text NOT NULL,
	`acked_at` text,
	`completed_at` text,
	`result` text,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`zone_id`) REFERENCES `irrigation_zone`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_irrigation_command`
	SELECT `id`, `created_at`, `updated_at`, `user_id`, `zone_id`, `zone_number`,
	       `command`, `duration_min`,
	       CASE
	       	WHEN `status` IN ('pending', 'acked', 'done', 'failed') THEN `status`
	       	WHEN `completed_at` IS NOT NULL THEN 'done'
	       	WHEN `acked_at` IS NOT NULL THEN 'acked'
	       	ELSE 'pending'
	       END,
	       `requested_by`, `requested_at`,
	       `acked_at`, `completed_at`, `result`
	FROM `irrigation_command`;
--> statement-breakpoint
DROP TABLE `irrigation_command`;
--> statement-breakpoint
ALTER TABLE `__new_irrigation_command` RENAME TO `irrigation_command`;
--> statement-breakpoint
CREATE INDEX `irrigation_command_user_status_idx` ON `irrigation_command` (`user_id`,`status`);
