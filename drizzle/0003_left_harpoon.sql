ALTER TABLE `department_settings` ADD `serialPrefix` varchar(24) DEFAULT 'POL' NOT NULL;--> statement-breakpoint
ALTER TABLE `telegrams` ADD `priority` enum('slow','normal','urgent') DEFAULT 'normal' NOT NULL;--> statement-breakpoint
UPDATE `telegrams` SET `priority` = 'urgent' WHERE `classification` = 'urgent';--> statement-breakpoint
ALTER TABLE `telegrams` MODIFY COLUMN `classification` enum('secret','normal') NOT NULL DEFAULT 'normal';
