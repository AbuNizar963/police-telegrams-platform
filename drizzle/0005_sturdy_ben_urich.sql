ALTER TABLE `department_settings` ADD `unitName` varchar(255) DEFAULT 'وحدة العمليات' NOT NULL;--> statement-breakpoint
ALTER TABLE `department_settings` ADD `unitChiefRank` varchar(120) DEFAULT 'العقيد' NOT NULL;--> statement-breakpoint
ALTER TABLE `department_settings` ADD `unitChiefName` varchar(255) DEFAULT 'رئيس الوحدة' NOT NULL;