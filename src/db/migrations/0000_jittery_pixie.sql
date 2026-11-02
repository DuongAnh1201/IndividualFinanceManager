CREATE TABLE `bottle` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`mascot` text NOT NULL,
	`sort_order` integer NOT NULL,
	`archived_at` text
);
--> statement-breakpoint
CREATE TABLE `bottle_allocation` (
	`id` text PRIMARY KEY NOT NULL,
	`income_id` text NOT NULL,
	`bottle_id` text NOT NULL,
	`amount_minor` integer NOT NULL,
	FOREIGN KEY (`income_id`) REFERENCES `income`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`bottle_id`) REFERENCES `bottle`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "allocation_amount" CHECK(typeof("bottle_allocation"."amount_minor") = 'integer' AND "bottle_allocation"."amount_minor" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `allocation_income_bottle` ON `bottle_allocation` (`income_id`,`bottle_id`);--> statement-breakpoint
CREATE TABLE `bottle_rule_ratio` (
	`version_id` text NOT NULL,
	`bottle_id` text NOT NULL,
	`ratio` integer NOT NULL,
	PRIMARY KEY(`version_id`, `bottle_id`),
	FOREIGN KEY (`version_id`) REFERENCES `bottle_rule_version`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`bottle_id`) REFERENCES `bottle`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "ratio_positive_integer" CHECK(typeof("bottle_rule_ratio"."ratio") = 'integer' AND "bottle_rule_ratio"."ratio" > 0)
);
--> statement-breakpoint
CREATE TABLE `bottle_rule_version` (
	`id` text PRIMARY KEY NOT NULL,
	`effective_from` text NOT NULL,
	`note` text
);
--> statement-breakpoint
CREATE TABLE `bottle_transfer` (
	`id` text PRIMARY KEY NOT NULL,
	`from_bottle_id` text NOT NULL,
	`to_bottle_id` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`date` text NOT NULL,
	`note` text,
	FOREIGN KEY (`from_bottle_id`) REFERENCES `bottle`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`to_bottle_id`) REFERENCES `bottle`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "transfer_amount" CHECK(typeof("bottle_transfer"."amount_minor") = 'integer' AND "bottle_transfer"."amount_minor" > 0),
	CONSTRAINT "transfer_distinct_bottles" CHECK("bottle_transfer"."from_bottle_id" <> "bottle_transfer"."to_bottle_id")
);
--> statement-breakpoint
CREATE TABLE `category` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`counts_toward_living_limit` integer NOT NULL,
	`default_bottle_id` text,
	`color` text NOT NULL,
	`mascot` text NOT NULL,
	`archived_at` text,
	FOREIGN KEY (`default_bottle_id`) REFERENCES `bottle`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "category_kind" CHECK("category"."kind" IN ('subscription','daily','other')),
	CONSTRAINT "category_living_flag" CHECK("category"."counts_toward_living_limit" IN (0,1))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `category_name_unique` ON `category` (`name`);--> statement-breakpoint
CREATE TABLE `exchange_rate` (
	`month` text NOT NULL,
	`currency` text NOT NULL,
	`rate_to_base` real NOT NULL,
	PRIMARY KEY(`month`, `currency`),
	CONSTRAINT "rate_positive" CHECK("exchange_rate"."rate_to_base" > 0)
);
--> statement-breakpoint
CREATE TABLE `expense` (
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
	CONSTRAINT "expense_amount" CHECK(typeof("expense"."amount_minor") = 'integer' AND "expense"."amount_minor" > 0),
	CONSTRAINT "expense_source" CHECK("expense"."source" IN ('manual','subscription')),
	CONSTRAINT "expense_billing_link" CHECK(("expense"."source" = 'manual' AND "expense"."subscription_id" IS NULL AND "expense"."billing_month" IS NULL) OR ("expense"."source" = 'subscription' AND "expense"."subscription_id" IS NOT NULL AND "expense"."billing_month" IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `expense_subscription_month` ON `expense` (`subscription_id`,`billing_month`);--> statement-breakpoint
CREATE TABLE `income` (
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
	CONSTRAINT "income_amount" CHECK(typeof("income"."amount_minor") = 'integer' AND "income"."amount_minor" > 0)
);
--> statement-breakpoint
CREATE TABLE `living_limit` (
	`month` text PRIMARY KEY NOT NULL,
	`limit_minor` integer NOT NULL,
	CONSTRAINT "limit_nonnegative_integer" CHECK(typeof("living_limit"."limit_minor") = 'integer' AND "living_limit"."limit_minor" >= 0)
);
--> statement-breakpoint
CREATE TABLE `monthly_report` (
	`month` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`generated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `payment_method` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`last4` text,
	`archived_at` text,
	CONSTRAINT "payment_method_type" CHECK("payment_method"."type" IN ('credit','debit','cash'))
);
--> statement-breakpoint
CREATE TABLE `reminder` (
	`slot` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`resolved_at` text,
	CONSTRAINT "reminder_status" CHECK("reminder"."status" IN ('pending','done','dismissed'))
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`base_currency` text DEFAULT 'USD' NOT NULL,
	`pay_days` text DEFAULT '[10,25]' NOT NULL,
	`week_starts_on` integer DEFAULT 1 NOT NULL,
	`timezone` text NOT NULL,
	CONSTRAINT "settings_singleton" CHECK("settings"."id" = 1),
	CONSTRAINT "settings_week_start" CHECK("settings"."week_starts_on" BETWEEN 0 AND 6)
);
--> statement-breakpoint
CREATE TABLE `subscription` (
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
	CONSTRAINT "subscription_amount" CHECK(typeof("subscription"."amount_minor") = 'integer' AND "subscription"."amount_minor" > 0),
	CONSTRAINT "subscription_billing_day" CHECK("subscription"."billing_day" BETWEEN 1 AND 31)
);
