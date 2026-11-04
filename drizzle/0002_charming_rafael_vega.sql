CREATE TABLE "launch_order" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"request_key" text NOT NULL,
	"service" text NOT NULL,
	"platform" text NOT NULL,
	"kind" text NOT NULL,
	"url" text NOT NULL,
	"title" text,
	"quantity" integer NOT NULL,
	"hours" integer,
	"amount_cents" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	CONSTRAINT "launch_order_quantity" CHECK ("launch_order"."quantity" between 1 and 10000 and ("launch_order"."service" <> 'viewers' or "launch_order"."quantity" >= 100)),
	CONSTRAINT "launch_order_hours" CHECK (("launch_order"."service" = 'viewers' and "launch_order"."hours" is not null and "launch_order"."hours" between 1 and 24) or ("launch_order"."service" <> 'viewers' and "launch_order"."hours" is null)),
	CONSTRAINT "launch_order_service" CHECK ("launch_order"."service" in ('viewers', 'views', 'followers')),
	CONSTRAINT "launch_order_amount" CHECK ("launch_order"."amount_cents" > 0),
	CONSTRAINT "launch_order_end" CHECK ("launch_order"."ends_at" > "launch_order"."created_at")
);
--> statement-breakpoint
ALTER TABLE "launch_order" ADD CONSTRAINT "launch_order_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "launch_order_user_request_idx" ON "launch_order" USING btree ("user_id","request_key");--> statement-breakpoint
CREATE INDEX "launch_order_user_created_idx" ON "launch_order" USING btree ("user_id","created_at","id");