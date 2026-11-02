CREATE TABLE "payment" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"request_key" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"fee_payer" text NOT NULL,
	"provider_id" text,
	"checkout_url" text,
	"status" text DEFAULT 'creating' NOT NULL,
	"credited_at" timestamp with time zone,
	"credit_cents" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_provider_id_unique" UNIQUE("provider_id"),
	CONSTRAINT "payment_amount_positive" CHECK ("payment"."amount_cents" > 0),
	CONSTRAINT "payment_currency_usd" CHECK ("payment"."currency" = 'USD'),
	CONSTRAINT "payment_fee_payer" CHECK ("payment"."fee_payer" in ('merchant', 'customer'))
);
--> statement-breakpoint
CREATE TABLE "payment_credit" (
	"id" text PRIMARY KEY NOT NULL,
	"payment_id" text NOT NULL,
	"user_id" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"confirmed_total_cents" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_credit_positive" CHECK ("payment_credit"."amount_cents" > 0)
);
--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_credit" ADD CONSTRAINT "payment_credit_payment_id_payment_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payment"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_credit" ADD CONSTRAINT "payment_credit_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payment_user_request_idx" ON "payment" USING btree ("user_id","request_key");--> statement-breakpoint
CREATE INDEX "payment_user_created_idx" ON "payment" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "payment_credit_user_idx" ON "payment_credit" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_credit_total_idx" ON "payment_credit" USING btree ("payment_id","confirmed_total_cents");