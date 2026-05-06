CREATE TABLE `irrigation_zone` (
	`id` text PRIMARY KEY NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`user_id` text NOT NULL,
	`valve_number` integer NOT NULL,
	`name` text NOT NULL,
	`wh52_channel` integer NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`moisture_threshold` integer DEFAULT 45 NOT NULL,
	`temp_minimum` real DEFAULT 5 NOT NULL,
	`rain_threshold_6h` real DEFAULT 3 NOT NULL,
	`max_duration_min` integer DEFAULT 90 NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `irrigation_schedule` (
	`id` text PRIMARY KEY NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`user_id` text NOT NULL,
	`zone_id` text NOT NULL,
	`program` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`weekdays` integer DEFAULT 127 NOT NULL,
	`start_time` text DEFAULT '06:00' NOT NULL,
	`duration_min` integer DEFAULT 30 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`zone_id`) REFERENCES `irrigation_zone`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `irrigation_sensor_reading` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`user_id` text NOT NULL,
	`channel` integer NOT NULL,
	`soil_moisture` real,
	`soil_temp` real,
	`soil_ec` real,
	`battery_ok` integer,
	`raw` text,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `irrigation_event` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`user_id` text NOT NULL,
	`zone_id` text,
	`zone_number` integer,
	`action` text NOT NULL,
	`reason` text,
	`detail` text,
	`duration_sec` integer,
	`raw` text,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`zone_id`) REFERENCES `irrigation_zone`(`id`) ON UPDATE no action ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE `irrigation_command` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`user_id` text NOT NULL,
	`zone_id` text,
	`zone_number` integer,
	`command` text NOT NULL,
	`duration_min` integer,
	`status` text DEFAULT 'pending' NOT NULL,
	`requested_by` text,
	`requested_at` text NOT NULL,
	`acked_at` text,
	`completed_at` text,
	`result` text,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`zone_id`) REFERENCES `irrigation_zone`(`id`) ON UPDATE no action ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE `irrigation_status` (
	`user_id` text PRIMARY KEY NOT NULL,
	`updated_at` text NOT NULL,
	`last_seen` text NOT NULL,
	`wifi_rssi` integer,
	`ecowitt_ok` integer,
	`valve_states` text DEFAULT '0000' NOT NULL,
	`firmware_version` text,
	`ip_address` text,
	`uptime_sec` integer,
	`raw` text,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `irrigation_zone_user_valve_idx` ON `irrigation_zone` (`user_id`,`valve_number`);
--> statement-breakpoint
CREATE INDEX `irrigation_schedule_user_zone_idx` ON `irrigation_schedule` (`user_id`,`zone_id`);
--> statement-breakpoint
CREATE INDEX `irrigation_sensor_user_channel_created_idx` ON `irrigation_sensor_reading` (`user_id`,`channel`,`created_at`);
--> statement-breakpoint
CREATE INDEX `irrigation_event_user_created_idx` ON `irrigation_event` (`user_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `irrigation_command_user_status_idx` ON `irrigation_command` (`user_id`,`status`);
