CREATE TABLE "launch_recent" (
	"user_id" text PRIMARY KEY NOT NULL,
	"entries" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "launch_recent" ADD CONSTRAINT "launch_recent_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;