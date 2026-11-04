ALTER TABLE "launch_order" ADD COLUMN "thumbnail" text;
--> statement-breakpoint
UPDATE "launch_order" AS launch
SET "thumbnail" = entry->>'thumbnail'
FROM "launch_recent" AS recent
CROSS JOIN LATERAL jsonb_array_elements(recent."entries") AS entry
WHERE recent."user_id" = launch."user_id"
  AND entry->>'url' = launch."url"
  AND entry->>'thumbnail' IS NOT NULL;
