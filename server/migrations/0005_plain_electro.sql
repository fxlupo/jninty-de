CREATE TABLE `garden_map_pin` (
	`id` text PRIMARY KEY NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`user_id` text NOT NULL,
	`plant_instance_id` text NOT NULL,
	`grid_x` real NOT NULL,
	`grid_y` real NOT NULL,
	`label` text
);
