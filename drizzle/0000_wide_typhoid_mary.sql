CREATE TABLE `coaching_state` (
	`id` text PRIMARY KEY NOT NULL,
	`constraints` text DEFAULT '[]' NOT NULL,
	`preferences` text DEFAULT '{}' NOT NULL,
	`discipline_state` text DEFAULT '{}' NOT NULL,
	`periodization` text DEFAULT '{}' NOT NULL,
	`flags` text DEFAULT '{}' NOT NULL,
	`created_at` integer DEFAULT (unixepoch('now') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('now') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `completed_workouts` (
	`id` text PRIMARY KEY NOT NULL,
	`vendor` text NOT NULL,
	`vendor_id` text NOT NULL,
	`activity_kind` text NOT NULL,
	`is_resolved` integer NOT NULL,
	`data` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch('now') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('now') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `completed_workouts_vendor_vendor_id` ON `completed_workouts` (`vendor`,`vendor_id`);--> statement-breakpoint
CREATE INDEX `completed_workouts_is_resolved` ON `completed_workouts` (`is_resolved`);--> statement-breakpoint
CREATE TABLE `planned_workouts` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`day_key` text NOT NULL,
	`notes` text,
	`status` text DEFAULT 'planned' NOT NULL,
	`routine_vendor` text NOT NULL,
	`routine_id` text,
	`completed_workout_id` text,
	`distance` real,
	`distance_units` text,
	`time_seconds` integer,
	`created_at` integer DEFAULT (unixepoch('now') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('now') * 1000) NOT NULL,
	FOREIGN KEY (`completed_workout_id`) REFERENCES `completed_workouts`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `planning_chat_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`seq` integer NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`replay_summary` text,
	`metadata` text,
	`sport_event_id` text,
	`is_proposal` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch('now') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('now') * 1000) NOT NULL,
	FOREIGN KEY (`thread_id`) REFERENCES `planning_chat_threads`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`sport_event_id`) REFERENCES `sport_events`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `planning_chat_messages_thread_seq` ON `planning_chat_messages` (`thread_id`,`seq`);--> statement-breakpoint
CREATE TABLE `planning_chat_threads` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text,
	`created_at` integer DEFAULT (unixepoch('now') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('now') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `service_strava_tokens` (
	`id` integer PRIMARY KEY NOT NULL,
	`refresh_token` text NOT NULL,
	`access_token` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch('now') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('now') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sport_events` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`event_day_key` text NOT NULL,
	`status` text DEFAULT 'planned' NOT NULL,
	`discipline` text,
	`notes` text,
	`targets` text NOT NULL,
	`url` text,
	`created_at` integer DEFAULT (unixepoch('now') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('now') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `sport_events_event_day_key_idx` ON `sport_events` (`event_day_key`);--> statement-breakpoint
CREATE TABLE `webhook_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`idempotency_key` text,
	`payload_json` text,
	`outcome` text NOT NULL,
	`detail` text,
	`created_at` integer DEFAULT (unixepoch('now') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('now') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `webhook_deliveries_idempotency_key_unique` ON `webhook_deliveries` (`idempotency_key`);--> statement-breakpoint
CREATE TABLE `weight_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`day_key` text NOT NULL,
	`measured_at` text NOT NULL,
	`weight_lbs` real NOT NULL,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch('now') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('now') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `weight_entries_day_key_unique` ON `weight_entries` (`day_key`);
--> statement-breakpoint
INSERT INTO `sport_events` (`id`, `name`, `event_day_key`, `status`, `discipline`, `notes`, `targets`, `url`)
VALUES (
	'sport_event_seed_pat_griskus_olympic_ct_2026',
	'Olympic Triathlon (CT)',
	'2026-06-20',
	'planned',
	'multi',
	NULL,
	'[{"activity":"swim","distance":1,"distance_units":"mi"},{"activity":"bike","distance":24,"distance_units":"mi"},{"activity":"run","distance":6.2,"distance_units":"mi"}]',
	'https://www.patgriskus.com/register'
);