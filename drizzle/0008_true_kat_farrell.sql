CREATE TABLE "balance_adjustment" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"admin_id" text NOT NULL,
	"delta_cents" integer NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "balance_adjustment_nonzero" CHECK ("balance_adjustment"."delta_cents" <> 0),
	CONSTRAINT "balance_adjustment_reason_length" CHECK (char_length("balance_adjustment"."reason") between 1 and 300)
);
--> statement-breakpoint
ALTER TABLE "balance_adjustment" ADD CONSTRAINT "balance_adjustment_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "balance_adjustment_user_created_idx" ON "balance_adjustment" USING btree ("user_id","created_at");