ALTER TABLE `completed_workouts` ADD `is_resolved` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
CREATE INDEX `completed_workouts_is_resolved` ON `completed_workouts` (`is_resolved`);
--> statement-breakpoint
UPDATE `completed_workouts`
SET `is_resolved` = 1
WHERE `id` IN (
  SELECT `completed_workout_id`
  FROM `planned_workouts`
  WHERE `completed_workout_id` IS NOT NULL
);
