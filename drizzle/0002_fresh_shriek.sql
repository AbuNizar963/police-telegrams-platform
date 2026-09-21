ALTER TABLE `telegrams` ADD `serialCode` varchar(48) NULL;--> statement-breakpoint
ALTER TABLE `telegrams` ADD `creatorBadgeId` varchar(80);--> statement-breakpoint
ALTER TABLE `telegrams` ADD `creatorIp` varchar(80);--> statement-breakpoint
ALTER TABLE `telegrams` ADD `creatorFingerprint` varchar(128);--> statement-breakpoint
ALTER TABLE `telegrams` ADD `category` enum('criminal','administrative','traffic','security','tactical') DEFAULT 'administrative' NOT NULL;--> statement-breakpoint
ALTER TABLE `telegrams` ADD `status` enum('pending','in_progress','resolved','archived') DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE `telegrams` ADD `gpsLatitude` varchar(40);--> statement-breakpoint
ALTER TABLE `telegrams` ADD `gpsLongitude` varchar(40);--> statement-breakpoint
ALTER TABLE `telegrams` ADD `archivedAt` timestamp NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `badgeNumber` varchar(80);--> statement-breakpoint
UPDATE `telegrams` SET `serialCode` = CONCAT('POL-', DATE_FORMAT(`createdAt`, '%Y-%m-%d'), '-', LPAD(`serialNumber`, 5, '0')) WHERE `serialCode` IS NULL;--> statement-breakpoint
ALTER TABLE `telegrams` MODIFY `serialCode` varchar(48) NOT NULL;--> statement-breakpoint
ALTER TABLE `telegrams` ADD CONSTRAINT `telegrams_serialCode_unique` UNIQUE(`serialCode`);
