-- Preserve child rows while referenced tables are rebuilt. Foreign keys stay ON.
-- Drizzle runs the complete migration in one transaction, including restoration.
CREATE TEMP TABLE __currency_allocations AS SELECT * FROM bottle_allocation;--> statement-breakpoint
DELETE FROM bottle_allocation;--> statement-breakpoint
CREATE TEMP TABLE __currency_expenses AS SELECT * FROM expense;--> statement-breakpoint
DELETE FROM expense;--> statement-breakpoint
CREATE TABLE `__new_expense` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`fx_rate_to_base` real,
	`category_id` text NOT NULL,
	`payment_method_id` text NOT NULL,
	`bottle_id` text,
	`note` text,
	`source` text NOT NULL,
	`subscription_id` text,
	`billing_month` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `category`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`payment_method_id`) REFERENCES `payment_method`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`bottle_id`) REFERENCES `bottle`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`subscription_id`) REFERENCES `subscription`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "expense_currency" CHECK("__new_expense"."currency" IN ('USD','VND')),
	CONSTRAINT "expense_amount" CHECK(typeof("__new_expense"."amount_minor") = 'integer' AND "__new_expense"."amount_minor" > 0),
	CONSTRAINT "expense_source" CHECK("__new_expense"."source" IN ('manual','subscription')),
	CONSTRAINT "expense_billing_link" CHECK(("__new_expense"."source" = 'manual' AND "__new_expense"."subscription_id" IS NULL AND "__new_expense"."billing_month" IS NULL) OR ("__new_expense"."source" = 'subscription' AND "__new_expense"."subscription_id" IS NOT NULL AND "__new_expense"."billing_month" IS NOT NULL))
);
--> statement-breakpoint
INSERT INTO `__new_expense`("id", "date", "amount_minor", "currency", "fx_rate_to_base", "category_id", "payment_method_id", "bottle_id", "note", "source", "subscription_id", "billing_month", "created_at", "updated_at") SELECT "id", "date", "amount_minor", "currency", "fx_rate_to_base", "category_id", "payment_method_id", "bottle_id", "note", "source", "subscription_id", "billing_month", "created_at", "updated_at" FROM `expense`;--> statement-breakpoint
DROP TABLE `expense`;--> statement-breakpoint
ALTER TABLE `__new_expense` RENAME TO `expense`;--> statement-breakpoint
CREATE INDEX `expense_date_idx` ON `expense` (`date`);--> statement-breakpoint
CREATE INDEX `expense_category_idx` ON `expense` (`category_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `expense_subscription_month` ON `expense` (`subscription_id`,`billing_month`);--> statement-breakpoint
CREATE TABLE `__new_income` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`fx_rate_to_base` real,
	`source` text NOT NULL,
	`note` text,
	`pay_day_slot` text,
	`bottle_rule_version_id` text NOT NULL,
	FOREIGN KEY (`bottle_rule_version_id`) REFERENCES `bottle_rule_version`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "income_currency" CHECK("__new_income"."currency" IN ('USD','VND')),
	CONSTRAINT "income_amount" CHECK(typeof("__new_income"."amount_minor") = 'integer' AND "__new_income"."amount_minor" > 0)
);
--> statement-breakpoint
INSERT INTO `__new_income`("id", "date", "amount_minor", "currency", "fx_rate_to_base", "source", "note", "pay_day_slot", "bottle_rule_version_id") SELECT "id", "date", "amount_minor", "currency", "fx_rate_to_base", "source", "note", "pay_day_slot", "bottle_rule_version_id" FROM `income`;--> statement-breakpoint
DROP TABLE `income`;--> statement-breakpoint
ALTER TABLE `__new_income` RENAME TO `income`;--> statement-breakpoint
CREATE INDEX `income_date_idx` ON `income` (`date`);--> statement-breakpoint
CREATE TABLE `__new_bottle_transfer` (
	`id` text PRIMARY KEY NOT NULL,
	`from_bottle_id` text NOT NULL,
	`to_bottle_id` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`date` text NOT NULL,
	`note` text,
	FOREIGN KEY (`from_bottle_id`) REFERENCES `bottle`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`to_bottle_id`) REFERENCES `bottle`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "transfer_currency" CHECK("__new_bottle_transfer"."currency" IN ('USD','VND')),
	CONSTRAINT "transfer_amount" CHECK(typeof("__new_bottle_transfer"."amount_minor") = 'integer' AND "__new_bottle_transfer"."amount_minor" > 0),
	CONSTRAINT "transfer_distinct_bottles" CHECK("__new_bottle_transfer"."from_bottle_id" <> "__new_bottle_transfer"."to_bottle_id")
);
--> statement-breakpoint
INSERT INTO `__new_bottle_transfer`("id", "from_bottle_id", "to_bottle_id", "amount_minor", "currency", "date", "note") SELECT "id", "from_bottle_id", "to_bottle_id", "amount_minor", "currency", "date", "note" FROM `bottle_transfer`;--> statement-breakpoint
DROP TABLE `bottle_transfer`;--> statement-breakpoint
ALTER TABLE `__new_bottle_transfer` RENAME TO `bottle_transfer`;--> statement-breakpoint
CREATE TABLE `__new_exchange_rate` (
	`month` text NOT NULL,
	`currency` text NOT NULL,
	`rate_to_base` real NOT NULL,
	PRIMARY KEY(`month`, `currency`),
	CONSTRAINT "rate_currency" CHECK("__new_exchange_rate"."currency" IN ('USD','VND')),
	CONSTRAINT "rate_positive" CHECK("__new_exchange_rate"."rate_to_base" > 0)
);
--> statement-breakpoint
INSERT INTO `__new_exchange_rate`("month", "currency", "rate_to_base") SELECT "month", "currency", "rate_to_base" FROM `exchange_rate`;--> statement-breakpoint
DROP TABLE `exchange_rate`;--> statement-breakpoint
ALTER TABLE `__new_exchange_rate` RENAME TO `exchange_rate`;--> statement-breakpoint
CREATE TABLE `__new_settings` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`base_currency` text DEFAULT 'USD' NOT NULL,
	`pay_days` text DEFAULT '[10,25]' NOT NULL,
	`week_starts_on` integer DEFAULT 1 NOT NULL,
	`timezone` text NOT NULL,
	CONSTRAINT "settings_currency" CHECK("__new_settings"."base_currency" IN ('USD','VND')),
	CONSTRAINT "settings_singleton" CHECK("__new_settings"."id" = 1),
	CONSTRAINT "settings_week_start" CHECK("__new_settings"."week_starts_on" BETWEEN 0 AND 6)
);
--> statement-breakpoint
INSERT INTO `__new_settings`("id", "base_currency", "pay_days", "week_starts_on", "timezone") SELECT "id", "base_currency", "pay_days", "week_starts_on", "timezone" FROM `settings`;--> statement-breakpoint
DROP TABLE `settings`;--> statement-breakpoint
ALTER TABLE `__new_settings` RENAME TO `settings`;--> statement-breakpoint
CREATE TABLE `__new_subscription` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`category_id` text NOT NULL,
	`payment_method_id` text NOT NULL,
	`billing_day` integer NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `category`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`payment_method_id`) REFERENCES `payment_method`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "subscription_currency" CHECK("__new_subscription"."currency" IN ('USD','VND')),
	CONSTRAINT "subscription_amount" CHECK(typeof("__new_subscription"."amount_minor") = 'integer' AND "__new_subscription"."amount_minor" > 0),
	CONSTRAINT "subscription_billing_day" CHECK("__new_subscription"."billing_day" BETWEEN 1 AND 31)
);
--> statement-breakpoint
INSERT INTO `__new_subscription`("id", "name", "amount_minor", "currency", "category_id", "payment_method_id", "billing_day", "start_date", "end_date", "created_at", "updated_at") SELECT "id", "name", "amount_minor", "currency", "category_id", "payment_method_id", "billing_day", "start_date", "end_date", "created_at", "updated_at" FROM `subscription`;--> statement-breakpoint
DROP TABLE `subscription`;--> statement-breakpoint
ALTER TABLE `__new_subscription` RENAME TO `subscription`;
--> statement-breakpoint
INSERT INTO expense SELECT * FROM __currency_expenses;--> statement-breakpoint
INSERT INTO bottle_allocation SELECT * FROM __currency_allocations;--> statement-breakpoint
DROP TABLE __currency_expenses;--> statement-breakpoint
DROP TABLE __currency_allocations;
