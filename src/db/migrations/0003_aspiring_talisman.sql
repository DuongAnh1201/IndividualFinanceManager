ALTER TABLE `settings` ADD `limit_warning_percent` integer DEFAULT 80 NOT NULL CHECK (`limit_warning_percent` BETWEEN 50 AND 99);
