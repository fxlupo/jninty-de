CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` text,
	`refresh_token_expires_at` text,
	`scope` text,
	`password` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `expense` (
	`id` text PRIMARY KEY NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`amount` real NOT NULL,
	`store` text,
	`date` text NOT NULL,
	`season_id` text,
	`notes` text
);
--> statement-breakpoint
CREATE TABLE `garden_bed` (
	`id` text PRIMARY KEY NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`grid_x` real NOT NULL,
	`grid_y` real NOT NULL,
	`grid_width` real NOT NULL,
	`grid_height` real NOT NULL,
	`shape` text NOT NULL,
	`color` text NOT NULL,
	`sun_exposure` text,
	`soil_type` text,
	`irrigation_method` text,
	`notes` text
);
--> statement-breakpoint
CREATE TABLE `journal_entry` (
	`id` text PRIMARY KEY NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`user_id` text NOT NULL,
	`plant_instance_id` text,
	`bed_id` text,
	`season_id` text NOT NULL,
	`activity_type` text NOT NULL,
	`title` text,
	`body` text NOT NULL,
	`photo_ids` text DEFAULT '[]' NOT NULL,
	`is_milestone` integer NOT NULL,
	`milestone_type` text,
	`harvest_weight` real,
	`weather_snapshot` text
);
--> statement-breakpoint
CREATE TABLE `photo` (
	`id` text PRIMARY KEY NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`user_id` text NOT NULL,
	`thumbnail_url` text NOT NULL,
	`display_url` text,
	`original_stored` integer DEFAULT false NOT NULL,
	`caption` text,
	`taken_at` text,
	`width` integer,
	`height` integer
);
--> statement-breakpoint
CREATE TABLE `planting_schedule` (
	`id` text PRIMARY KEY NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`user_id` text NOT NULL,
	`crop_id` text NOT NULL,
	`variety_id` text NOT NULL,
	`crop_source` text NOT NULL,
	`crop_name` text NOT NULL,
	`variety_name` text NOT NULL,
	`bed_id` text,
	`bed_name` text,
	`anchor_date` text NOT NULL,
	`direction` text NOT NULL,
	`season_id` text,
	`succession_group_id` text,
	`succession_index` integer,
	`seed_start_date` text,
	`bed_prep_date` text,
	`transplant_date` text,
	`cultivate_start_date` text,
	`harvest_start_date` text NOT NULL,
	`harvest_end_date` text NOT NULL,
	`status` text NOT NULL,
	`notes` text
);
--> statement-breakpoint
CREATE TABLE `planting` (
	`id` text PRIMARY KEY NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`user_id` text NOT NULL,
	`plant_instance_id` text NOT NULL,
	`season_id` text NOT NULL,
	`bed_id` text,
	`date_planted` text,
	`date_removed` text,
	`outcome` text,
	`notes` text
);
--> statement-breakpoint
CREATE TABLE `plant` (
	`id` text PRIMARY KEY NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`user_id` text NOT NULL,
	`species` text NOT NULL,
	`nickname` text,
	`variety` text,
	`type` text NOT NULL,
	`is_perennial` integer NOT NULL,
	`source` text NOT NULL,
	`seed_id` text,
	`status` text NOT NULL,
	`date_acquired` text,
	`care_notes` text,
	`purchase_price` real,
	`purchase_store` text,
	`tags` text DEFAULT '[]' NOT NULL,
	`photo_ids` text DEFAULT '[]' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `schedule_task` (
	`id` text PRIMARY KEY NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`user_id` text NOT NULL,
	`planting_schedule_id` text NOT NULL,
	`task_type` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`crop_name` text NOT NULL,
	`variety_name` text NOT NULL,
	`bed_id` text,
	`bed_name` text,
	`scheduled_date` text NOT NULL,
	`original_date` text NOT NULL,
	`is_completed` integer NOT NULL,
	`completed_date` text,
	`completed_at` text,
	`sequence_order` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `season` (
	`id` text PRIMARY KEY NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`year` integer NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`is_active` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `seed` (
	`id` text PRIMARY KEY NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`species` text NOT NULL,
	`variety` text,
	`brand` text,
	`supplier` text,
	`quantity_remaining` real NOT NULL,
	`quantity_unit` text NOT NULL,
	`purchase_date` text,
	`expiry_date` text,
	`germination_rate` integer,
	`cost` real,
	`purchase_store` text,
	`storage_location` text,
	`notes` text
);
--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` text NOT NULL,
	`token` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE TABLE `settings` (
	`user_id` text PRIMARY KEY NOT NULL,
	`updated_at` text NOT NULL,
	`growing_zone` text DEFAULT '7a' NOT NULL,
	`last_frost_date` text DEFAULT '03-15' NOT NULL,
	`first_frost_date` text DEFAULT '11-01' NOT NULL,
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
CREATE TABLE `task_rule` (
	`id` text PRIMARY KEY NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`user_id` text NOT NULL,
	`applies_to` text NOT NULL,
	`trigger` text NOT NULL,
	`task_def` text NOT NULL,
	`is_built_in` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `task` (
	`id` text PRIMARY KEY NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`plant_instance_id` text,
	`bed_id` text,
	`season_id` text,
	`due_date` text NOT NULL,
	`priority` text NOT NULL,
	`is_completed` integer NOT NULL,
	`completed_at` text,
	`is_auto_generated` integer,
	`rule_id` text,
	`generated_at` text,
	`dismissed_at` text,
	`recurrence` text
);
--> statement-breakpoint
CREATE TABLE `user_plant_knowledge` (
	`id` text PRIMARY KEY NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`user_id` text NOT NULL,
	`species` text NOT NULL,
	`variety` text,
	`common_name` text NOT NULL,
	`plant_type` text NOT NULL,
	`is_perennial` integer NOT NULL,
	`crop_group` text NOT NULL,
	`family` text,
	`indoor_start_weeks_before_last_frost` integer,
	`transplant_weeks_after_last_frost` integer,
	`direct_sow_weeks_before_last_frost` integer,
	`direct_sow_weeks_after_last_frost` integer,
	`days_to_germination` integer,
	`days_to_maturity` integer,
	`spacing_inches` integer,
	`sun_needs` text NOT NULL,
	`water_needs` text NOT NULL,
	`soil_preference` text,
	`mature_height_inches` integer,
	`mature_spread_inches` integer,
	`growth_rate` text,
	`scheduling` text,
	`good_companions` text,
	`bad_companions` text,
	`common_pests` text,
	`common_diseases` text
);
--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP
);
