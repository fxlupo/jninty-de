-- M1: unique constraint on (user_id, valve_number) prevents duplicate default zones
--     from race conditions in ensureDefaultZones()
CREATE UNIQUE INDEX `irrigation_zone_user_valve_idx` ON `irrigation_zone` (`user_id`,`valve_number`);
--> statement-breakpoint

-- M6: add a CHECK constraint so the DB enforces the command status lifecycle
--     (pending → acked → done / failed). SQLite requires full table recreation.
PRAGMA foreign_keys=OFF;
--> statement-breakpoint
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
	       `command`, `duration_min`, `status`, `requested_by`, `requested_at`,
	       `acked_at`, `completed_at`, `result`
	FROM `irrigation_command`;
--> statement-breakpoint
DROP TABLE `irrigation_command`;
--> statement-breakpoint
ALTER TABLE `__new_irrigation_command` RENAME TO `irrigation_command`;
--> statement-breakpoint
PRAGMA foreign_keys=ON;
