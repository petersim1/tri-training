ALTER TABLE `completed_workouts` ADD `activity_kind` text NOT NULL DEFAULT 'workout';
--> statement-breakpoint
UPDATE `completed_workouts` SET `activity_kind` = 'lift' WHERE `vendor` = 'hevy';
--> statement-breakpoint
UPDATE `completed_workouts`
SET `activity_kind` = lower(json_extract(`data`, '$.sport_type'))
WHERE `vendor` = 'strava'
  AND json_extract(`data`, '$.sport_type') IS NOT NULL
  AND trim(json_extract(`data`, '$.sport_type')) != '';
