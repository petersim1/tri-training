ALTER TABLE `weight_entries` ADD `day_key` text;
--> statement-breakpoint
UPDATE `weight_entries` SET `day_key` = substr(`measured_at`, 1, 10) WHERE `day_key` IS NULL;
--> statement-breakpoint
DELETE FROM `weight_entries` WHERE `id` IN (
  SELECT `w1`.`id` FROM `weight_entries` AS `w1`
  INNER JOIN `weight_entries` AS `w2`
    ON `w1`.`day_key` = `w2`.`day_key`
    AND (`w2`.`updated_at` > `w1`.`updated_at`
      OR (`w2`.`updated_at` = `w1`.`updated_at` AND `w2`.`id` > `w1`.`id`))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `weight_entries_day_key_unique` ON `weight_entries` (`day_key`);
