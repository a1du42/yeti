ALTER TABLE "launch_order" ADD COLUMN "follower_interval_seconds" integer;--> statement-breakpoint
ALTER TABLE "launch_order" ADD COLUMN "follower_floating_interval" boolean;--> statement-breakpoint
ALTER TABLE "launch_order" ADD CONSTRAINT "launch_order_follower_settings" CHECK (("launch_order"."follower_interval_seconds" is null and "launch_order"."follower_floating_interval" is null) or
    ("launch_order"."service" = 'twitch-followers' and "launch_order"."provider_status" is not null and "launch_order"."follower_interval_seconds" is not null
      and "launch_order"."follower_interval_seconds" between 1 and 86400));