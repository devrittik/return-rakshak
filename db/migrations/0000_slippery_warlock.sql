CREATE TABLE `policies` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`duration_value` integer NOT NULL,
	`duration_unit` text DEFAULT 'days' NOT NULL,
	`start_date` text NOT NULL,
	`counting_convention` text DEFAULT 'calendar' NOT NULL,
	`inclusive_end` integer DEFAULT true NOT NULL,
	`deadline_date` text,
	`source` text DEFAULT 'unknown' NOT NULL,
	`evidence` text,
	`verification_status` text DEFAULT 'needs_review' NOT NULL,
	`verified_at` integer,
	`notes` text,
	`created_at` integer DEFAULT (strftime('%s','now') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (strftime('%s','now') * 1000) NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `policies_product_idx` ON `policies` (`product_id`);--> statement-breakpoint
CREATE INDEX `policies_user_deadline_idx` ON `policies` (`user_id`,`deadline_date`);--> statement-breakpoint
CREATE INDEX `policies_user_status_idx` ON `policies` (`user_id`,`verification_status`);--> statement-breakpoint
CREATE TABLE `products` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`seller` text,
	`purchase_date` text,
	`price_minor` integer,
	`currency` text(3),
	`category` text,
	`notes` text,
	`source` text DEFAULT 'manual_entry' NOT NULL,
	`created_at` integer DEFAULT (strftime('%s','now') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (strftime('%s','now') * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `products_user_purchase_idx` ON `products` (`user_id`,`purchase_date`);--> statement-breakpoint
CREATE INDEX `products_user_created_idx` ON `products` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `reminders` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`product_id` text NOT NULL,
	`policy_id` text,
	`kind` text NOT NULL,
	`label` text NOT NULL,
	`remind_on` text NOT NULL,
	`lead_days` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`dismissed_at` integer,
	`created_at` integer DEFAULT (strftime('%s','now') * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`policy_id`) REFERENCES `policies`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `reminders_user_status_idx` ON `reminders` (`user_id`,`status`,`remind_on`);--> statement-breakpoint
CREATE INDEX `reminders_product_idx` ON `reminders` (`product_id`);--> statement-breakpoint
CREATE INDEX `reminders_policy_idx` ON `reminders` (`policy_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`display_name` text,
	`created_at` integer DEFAULT (strftime('%s','now') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (strftime('%s','now') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);