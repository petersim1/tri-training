CREATE TABLE `completed_workouts` (
	`id` text PRIMARY KEY NOT NULL,
	`vendor` text NOT NULL,
	`external_id` text NOT NULL,
	`distance_m` real,
	`moving_time_seconds` integer,
	`elapsed_time_seconds` integer,
	`calories` real,
	`title` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `planned_workouts` ADD `completed_workout_id` text REFERENCES completed_workouts(`id`);
--> statement-breakpoint
CREATE TEMP TABLE `plan_completed_map` (`plan_id` text PRIMARY KEY NOT NULL, `completed_id` text NOT NULL);
--> statement-breakpoint
INSERT INTO `plan_completed_map` (`plan_id`, `completed_id`)
SELECT `id`, lower(hex(randomblob(16))) FROM `planned_workouts` WHERE `workout_id` IS NOT NULL AND trim(`workout_id`) != '';
--> statement-breakpoint
INSERT INTO `completed_workouts` (`id`, `vendor`, `external_id`, `distance_m`, `moving_time_seconds`, `elapsed_time_seconds`, `calories`, `title`, `created_at`, `updated_at`)
SELECT `m`.`completed_id`, `p`.`workout_vendor`, `p`.`workout_id`, NULL, NULL, NULL, NULL, NULL, `p`.`created_at`, `p`.`updated_at`
FROM `planned_workouts` `p`
INNER JOIN `plan_completed_map` `m` ON `m`.`plan_id` = `p`.`id`;
--> statement-breakpoint
UPDATE `planned_workouts` SET `completed_workout_id` = (
	SELECT `completed_id` FROM `plan_completed_map` WHERE `plan_completed_map`.`plan_id` = `planned_workouts`.`id`
) WHERE `id` IN (SELECT `plan_id` FROM `plan_completed_map`);
--> statement-breakpoint
ALTER TABLE `planned_workouts` DROP COLUMN `workout_vendor`;
--> statement-breakpoint
ALTER TABLE `planned_workouts` DROP COLUMN `workout_id`;
