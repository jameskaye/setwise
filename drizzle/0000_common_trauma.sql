CREATE TABLE `coach_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`session_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`message` text NOT NULL,
	`response` text NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_coach_owner_session` ON `coach_messages` (`owner`,`session_id`);--> statement-breakpoint
CREATE TABLE `exercises` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_exercises_owner` ON `exercises` (`owner`);--> statement-breakpoint
CREATE TABLE `profiles` (
	`owner` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `progressions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`session_id` text NOT NULL,
	`set_id` text NOT NULL,
	`variant_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`recommendation` text NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`set_id`) REFERENCES `sets`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`variant_id`) REFERENCES `variants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_progressions_owner_variant` ON `progressions` (`owner`,`variant_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`name` text NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`status` text NOT NULL,
	`notes` text NOT NULL,
	`plan` text NOT NULL,
	`rules` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_sessions_owner_started` ON `sessions` (`owner`,`started_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_sessions_one_active` ON `sessions` (`owner`) WHERE "sessions"."status" = 'active';--> statement-breakpoint
CREATE TABLE `sets` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`session_id` text NOT NULL,
	`variant_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`weight` real NOT NULL,
	`reps` integer NOT NULL,
	`rir` integer,
	`side` text NOT NULL,
	`type` text NOT NULL,
	`pain_location` text NOT NULL,
	`pain_severity` integer NOT NULL,
	`note` text NOT NULL,
	`suggested_weight` real,
	`suggested_reps` integer,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`variant_id`) REFERENCES `variants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_sets_owner_variant_time` ON `sets` (`owner`,`variant_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_sets_owner_session` ON `sets` (`owner`,`session_id`);--> statement-breakpoint
CREATE TABLE `variants` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`exercise_id` text NOT NULL,
	`name` text NOT NULL,
	`equipment` text NOT NULL,
	`unilateral` integer NOT NULL,
	`load_mode` text NOT NULL,
	`increment` real NOT NULL,
	`min_reps` integer NOT NULL,
	`max_reps` integer NOT NULL,
	`default_sets` integer NOT NULL,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_variants_owner` ON `variants` (`owner`);