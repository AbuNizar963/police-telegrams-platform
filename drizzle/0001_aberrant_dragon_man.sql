CREATE TABLE `audit_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`actorUserId` int NOT NULL,
	`actorName` varchar(255) NOT NULL,
	`action` varchar(80) NOT NULL,
	`entityType` varchar(80) NOT NULL,
	`entityId` varchar(80),
	`metadata` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `audit_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `department_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`configKey` varchar(32) NOT NULL DEFAULT 'primary',
	`departmentName` varchar(255) NOT NULL DEFAULT 'إدارة الشرطة',
	`serialStart` int NOT NULL DEFAULT 1,
	`nextSerial` int NOT NULL DEFAULT 1,
	`logoUrl` text,
	`updatedByUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `department_settings_id` PRIMARY KEY(`id`),
	CONSTRAINT `department_settings_configKey_unique` UNIQUE(`configKey`)
);
--> statement-breakpoint
CREATE TABLE `telegrams` (
	`id` int AUTO_INCREMENT NOT NULL,
	`serialNumber` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`createdByUserId` int NOT NULL,
	`creatorName` varchar(255) NOT NULL,
	`creatorEmail` varchar(320),
	`subject` varchar(255) NOT NULL,
	`recipient` varchar(255) NOT NULL,
	`body` text NOT NULL,
	`classification` enum('urgent','secret','normal') NOT NULL DEFAULT 'normal',
	`attachmentManifest` text,
	CONSTRAINT `telegrams_id` PRIMARY KEY(`id`),
	CONSTRAINT `telegrams_serialNumber_unique` UNIQUE(`serialNumber`)
);
--> statement-breakpoint
CREATE INDEX `audit_actor_idx` ON `audit_logs` (`actorUserId`);--> statement-breakpoint
CREATE INDEX `audit_created_at_idx` ON `audit_logs` (`createdAt`);--> statement-breakpoint
CREATE INDEX `telegrams_creator_idx` ON `telegrams` (`createdByUserId`);--> statement-breakpoint
CREATE INDEX `telegrams_created_at_idx` ON `telegrams` (`createdAt`);--> statement-breakpoint
CREATE INDEX `telegrams_classification_idx` ON `telegrams` (`classification`);