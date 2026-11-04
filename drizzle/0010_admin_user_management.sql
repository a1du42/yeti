CREATE TABLE "user_admin_event" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"admin_id" text NOT NULL,
	"action" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_admin_event_action" CHECK ("user_admin_event"."action" in ('edit', 'block', 'unblock', 'delete'))
);
--> statement-breakpoint
ALTER TABLE "launch_order" DROP CONSTRAINT "launch_order_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "blocked" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "user_admin_event_user_idx" ON "user_admin_event" USING btree ("user_id","created_at");--> statement-breakpoint
ALTER TABLE "launch_order" ADD CONSTRAINT "launch_order_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE FUNCTION "yeti_require_unblocked_session_user"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM 1 FROM "public"."user" WHERE "id" = NEW."user_id" AND NOT "blocked" FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Session user unavailable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "session_require_unblocked_user"
  BEFORE INSERT ON "session" FOR EACH ROW EXECUTE FUNCTION "yeti_require_unblocked_session_user"();
