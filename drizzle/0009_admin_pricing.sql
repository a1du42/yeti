CREATE TABLE "pricing_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"factor" integer DEFAULT 100 NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pricing_settings_singleton" CHECK ("pricing_settings"."id" = 1),
	CONSTRAINT "pricing_settings_factor_range" CHECK ("pricing_settings"."factor" between 1 and 10000)
);
--> statement-breakpoint
INSERT INTO "pricing_settings" ("id") VALUES (1);
