CREATE TABLE `plant_reminder` (
	`id` text PRIMARY KEY NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`user_id` text NOT NULL,
	`plant_id` text NOT NULL,
	`category` text NOT NULL,
	`title` text NOT NULL,
	`notes` text,
	`start_date` text NOT NULL,
	`recurrence` text DEFAULT 'once' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`last_run_at` text
);
