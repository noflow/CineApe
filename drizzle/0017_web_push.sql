ALTER TYPE "notification_kind" ADD VALUE IF NOT EXISTS 'release';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "web_push_subscriptions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "endpoint" text NOT NULL UNIQUE,
  "p256dh" text NOT NULL,
  "auth" text NOT NULL,
  "notify_movies" boolean DEFAULT true NOT NULL,
  "notify_tv" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "release_alert_dispatches" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tmdb_id" integer NOT NULL,
  "type" "title_type" NOT NULL,
  "release_date" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "release_alert_dispatches_unique" ON "release_alert_dispatches" USING btree ("tmdb_id","type","release_date");
