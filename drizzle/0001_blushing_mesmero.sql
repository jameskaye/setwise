CREATE TABLE `routine_revisions` (
	`owner` text NOT NULL,
	`revision` integer NOT NULL,
	`request_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`reason` text NOT NULL,
	`routine` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_routine_owner_revision` ON `routine_revisions` (`owner`,`revision`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_routine_owner_request` ON `routine_revisions` (`owner`,`request_id`);--> statement-breakpoint
ALTER TABLE `sessions` ADD `prescriptions` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `sessions` ADD `routine_revision` integer;