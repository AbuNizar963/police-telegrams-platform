ALTER TABLE `department_settings` ADD `timezone` varchar(64) DEFAULT 'Asia/Riyadh' NOT NULL;--> statement-breakpoint
ALTER TABLE `department_settings` ADD `dateFormat` varchar(32) DEFAULT 'dd/MM/yyyy HH:mm:ss' NOT NULL;--> statement-breakpoint
ALTER TABLE `department_settings` ADD `numberSystem` enum('latin','arabic','hindi') DEFAULT 'latin' NOT NULL;