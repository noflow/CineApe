ALTER TYPE "editorial_status" ADD VALUE IF NOT EXISTS 'archived';
--> statement-breakpoint
ALTER TABLE "editor_reviews" ADD COLUMN IF NOT EXISTS "scheduled_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "editor_lists" ADD COLUMN IF NOT EXISTS "scheduled_at" timestamp with time zone;
