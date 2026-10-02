CREATE TABLE `telegram_attachments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`telegramId` int NOT NULL,
	`fileKey` varchar(500) NOT NULL,
	`fileName` varchar(180) NOT NULL,
	`contentType` varchar(120) NOT NULL,
	`size` int NOT NULL,
	`checksumSha256` varchar(64),
	`uploadedByUserId` int NOT NULL,
	`scanStatus` enum('pending','clean','blocked') NOT NULL DEFAULT 'pending',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `telegram_attachments_id` PRIMARY KEY(`id`),
	CONSTRAINT `telegram_attachments_fileKey_unique` UNIQUE(`fileKey`)
);
--> statement-breakpoint
CREATE INDEX `telegram_attachments_telegram_idx` ON `telegram_attachments` (`telegramId`);--> statement-breakpoint
CREATE INDEX `telegram_attachments_uploader_idx` ON `telegram_attachments` (`uploadedByUserId`);