ALTER TABLE "launch_order" ADD COLUMN "paused_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "launch_order" ADD COLUMN "region" text DEFAULT 'auto' NOT NULL;