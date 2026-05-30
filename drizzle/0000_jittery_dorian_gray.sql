CREATE TABLE `chat_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer DEFAULT (unixepoch('now') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('now') * 1000) NOT NULL,
	`thread_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`replay_summary` text,
	`tools` text DEFAULT '[]',
	`sport_event_id` text,
	`proposals` text,
	`is_coaching_state_update` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`thread_id`) REFERENCES `chat_threads`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`sport_event_id`) REFERENCES `sport_events`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `ix_chat_messages_thread_id` ON `chat_messages` (`thread_id`);--> statement-breakpoint
CREATE TABLE `chat_threads` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer DEFAULT (unixepoch('now') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('now') * 1000) NOT NULL,
	`title` text
);
--> statement-breakpoint
CREATE TABLE `coaching_state` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer DEFAULT (unixepoch('now') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('now') * 1000) NOT NULL,
	`state` text DEFAULT '{"physicalState":[],"disciplineState":{},"preferences":[],"directives":[]}' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `service_strava_tokens` (
	`created_at` integer DEFAULT (unixepoch('now') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('now') * 1000) NOT NULL,
	`id` integer PRIMARY KEY NOT NULL,
	`refresh_token` text NOT NULL,
	`access_token` text NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sport_events` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer DEFAULT (unixepoch('now') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('now') * 1000) NOT NULL,
	`name` text NOT NULL,
	`event_day_key` text NOT NULL,
	`status` text DEFAULT 'planned' NOT NULL,
	`discipline` text,
	`notes` text,
	`targets` text NOT NULL,
	`url` text
);
--> statement-breakpoint
CREATE INDEX `sport_events_event_day_key_idx` ON `sport_events` (`event_day_key`);--> statement-breakpoint
CREATE TABLE `vendor_activities` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer DEFAULT (unixepoch('now') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('now') * 1000) NOT NULL,
	`vendor` text NOT NULL,
	`vendor_id` text NOT NULL,
	`data` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `completed_workouts_vendor_vendor_id` ON `vendor_activities` (`vendor`,`vendor_id`);--> statement-breakpoint
CREATE TABLE `webhook_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer DEFAULT (unixepoch('now') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('now') * 1000) NOT NULL,
	`source` text NOT NULL,
	`idempotency_key` text,
	`payload_json` text,
	`outcome` text NOT NULL,
	`detail` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `webhook_deliveries_idempotency_key_unique` ON `webhook_deliveries` (`idempotency_key`);--> statement-breakpoint
CREATE TABLE `weight_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer DEFAULT (unixepoch('now') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('now') * 1000) NOT NULL,
	`day_key` text NOT NULL,
	`weight_lbs` real NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `weight_entries_day_key_unique` ON `weight_entries` (`day_key`);--> statement-breakpoint
CREATE INDEX `ix_weight_entries_day_key` ON `weight_entries` (`day_key`);--> statement-breakpoint
CREATE TABLE `workout_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer DEFAULT (unixepoch('now') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('now') * 1000) NOT NULL,
	`kind` text NOT NULL,
	`day_key` text NOT NULL,
	`notes` text,
	`status` text DEFAULT 'planned' NOT NULL,
	`routine_vendor` text,
	`routine_id` text,
	`vendor_activity_id` text,
	`distance` real,
	`distance_units` text,
	`time_seconds` integer,
	FOREIGN KEY (`vendor_activity_id`) REFERENCES `vendor_activities`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `ix_workout_entries_day_key` ON `workout_entries` (`day_key`);

INSERT INTO `sport_events` (`id`, `name`, `event_day_key`, `status`, `discipline`, `notes`, `targets`, `url`)
VALUES (
	'6886d0ed-a50a-4874-b766-6dbc5f8a9646',
	'Olympic Triathlon (CT)',
	'2026-06-20',
	'planned',
	'multi',
	NULL,
	'[{"activity":"swim","distance":1,"distance_units":"mi"},{"activity":"bike","distance":24,"distance_units":"mi"},{"activity":"run","distance":6.2,"distance_units":"mi"}]',
	'https://www.patgriskus.com/register'
);