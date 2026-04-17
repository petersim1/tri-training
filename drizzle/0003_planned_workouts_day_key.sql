ALTER TABLE `planned_workouts` ADD COLUMN `day_key` text;
--> statement-breakpoint
UPDATE `planned_workouts` SET `day_key` = date(`scheduled_at`);
--> statement-breakpoint
ALTER TABLE `planned_workouts` DROP COLUMN `scheduled_at`;
