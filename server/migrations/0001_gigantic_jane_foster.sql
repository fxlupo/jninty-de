PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_settings` (
	`user_id` text PRIMARY KEY NOT NULL,
	`updated_at` text NOT NULL,
	`growing_zone` text DEFAULT '7a' NOT NULL,
	`last_frost_date` text DEFAULT '2026-04-15' NOT NULL,
	`first_frost_date` text DEFAULT '2026-10-15' NOT NULL,
	`grid_unit` text DEFAULT 'meters' NOT NULL,
	`temperature_unit` text DEFAULT 'celsius' NOT NULL,
	`garden_name` text,
	`latitude` real,
	`longitude` real,
	`theme` text DEFAULT 'auto' NOT NULL,
	`high_contrast` integer DEFAULT false NOT NULL,
	`font_size` text DEFAULT 'normal' NOT NULL,
	`keep_original_photos` integer DEFAULT false NOT NULL,
	`last_export_date` text,
	`db_schema_version` integer DEFAULT 1 NOT NULL,
	`export_version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_settings`("user_id", "updated_at", "growing_zone", "last_frost_date", "first_frost_date", "grid_unit", "temperature_unit", "garden_name", "latitude", "longitude", "theme", "high_contrast", "font_size", "keep_original_photos", "last_export_date", "db_schema_version", "export_version") SELECT "user_id", "updated_at", "growing_zone", "last_frost_date", "first_frost_date", "grid_unit", "temperature_unit", "garden_name", "latitude", "longitude", "theme", "high_contrast", "font_size", "keep_original_photos", "last_export_date", "db_schema_version", "export_version" FROM `settings`;--> statement-breakpoint
DROP TABLE `settings`;--> statement-breakpoint
ALTER TABLE `__new_settings` RENAME TO `settings`;--> statement-breakpoint
PRAGMA foreign_keys=ON;