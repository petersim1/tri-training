CREATE TABLE `completed_workouts` (
	`id` text PRIMARY KEY NOT NULL,
	`vendor` text NOT NULL,
	`vendor_id` text NOT NULL,
	`data` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `completed_workouts_vendor_vendor_id` ON `completed_workouts` (`vendor`,`vendor_id`);--> statement-breakpoint
CREATE TABLE `planned_workouts` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`scheduled_at` text NOT NULL,
	`notes` text,
	`status` text DEFAULT 'planned' NOT NULL,
	`routine_vendor` text NOT NULL,
	`routine_id` text,
	`completed_workout_id` text,
	`distance` real,
	`distance_units` text,
	`time_seconds` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`completed_workout_id`) REFERENCES `completed_workouts`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `service_strava_tokens` (
	`id` integer PRIMARY KEY NOT NULL,
	`refresh_token` text NOT NULL,
	`access_token` text NOT NULL,
	`expires_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `webhook_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`idempotency_key` text,
	`payload_json` text,
	`outcome` text NOT NULL,
	`detail` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `webhook_deliveries_idempotency_key_unique` ON `webhook_deliveries` (`idempotency_key`);--> statement-breakpoint
CREATE TABLE `weight_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`day_key` text NOT NULL,
	`measured_at` text NOT NULL,
	`weight_lbs` real NOT NULL,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `weight_entries_day_key_unique` ON `weight_entries` (`day_key`);