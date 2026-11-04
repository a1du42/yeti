ALTER TABLE "launch_order" ADD COLUMN "provider_id" bigint;--> statement-breakpoint
ALTER TABLE "launch_order" ADD COLUMN "provider_status" text;--> statement-breakpoint
CREATE UNIQUE INDEX "launch_order_provider_idx" ON "launch_order" USING btree ("provider_id");--> statement-breakpoint
ALTER TABLE "launch_order" ADD CONSTRAINT "launch_order_provider_state" CHECK (("launch_order"."provider_id" is null and ("launch_order"."provider_status" is null or "launch_order"."provider_status" in ('submitting', 'unknown', 'rejected'))) or
    ("launch_order"."provider_id" is not null and "launch_order"."provider_status" is not null and "launch_order"."provider_status" in ('created', 'awaiting', 'working', 'stopped', 'completed', 'failed', 'deleted', 'refunded')));