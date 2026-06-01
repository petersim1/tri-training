ALTER TABLE `chat_messages` ADD `seq` integer NOT NULL;--> statement-breakpoint
ALTER TABLE `chat_messages` ADD `round` integer NOT NULL;--> statement-breakpoint
ALTER TABLE `chat_messages` ADD `is_success` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `chat_messages` ADD `proposal` text;--> statement-breakpoint
ALTER TABLE `chat_messages` DROP COLUMN `tools`;--> statement-breakpoint
ALTER TABLE `chat_messages` DROP COLUMN `proposals`;