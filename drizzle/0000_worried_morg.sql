CREATE TABLE `planned_workouts` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`scheduled_at` text NOT NULL,
	`notes` text,
	`status` text DEFAULT 'planned' NOT NULL,
	`workout_vendor` text NOT NULL,
	`routine_vendor` text NOT NULL,
	`workout_id` text,
	`routine_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `weight_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`measured_at` text NOT NULL,
	`weight_lbs` real NOT NULL,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
