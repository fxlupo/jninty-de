CREATE TABLE `calendar_event` (
	`id` text PRIMARY KEY NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`notes` text,
	`date` text NOT NULL,
	`type` text DEFAULT 'general' NOT NULL,
	`recurrence` text DEFAULT 'once' NOT NULL,
	`related_plant_id` text,
	`related_bed_id` text
);
