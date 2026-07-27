CREATE TABLE "date_nights" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "created_by" uuid NOT NULL,
  "status" "movie_night_status" DEFAULT 'open' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "date_night_members" (
  "date_night_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "joined_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "date_night_members_date_night_id_user_id_pk" PRIMARY KEY("date_night_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "date_night_slots" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "date_night_id" uuid NOT NULL,
  "day" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "date_night_slot_votes" (
  "date_night_id" uuid NOT NULL,
  "slot_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "date_night_slot_votes_date_night_id_user_id_pk" PRIMARY KEY("date_night_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "date_night_options" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "date_night_id" uuid NOT NULL,
  "title_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "date_night_option_votes" (
  "date_night_id" uuid NOT NULL,
  "option_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "date_night_option_votes_date_night_id_user_id_pk" PRIMARY KEY("date_night_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "date_nights" ADD CONSTRAINT "date_nights_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "date_night_members" ADD CONSTRAINT "date_night_members_date_night_id_date_nights_id_fk" FOREIGN KEY ("date_night_id") REFERENCES "public"."date_nights"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "date_night_members" ADD CONSTRAINT "date_night_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "date_night_slots" ADD CONSTRAINT "date_night_slots_date_night_id_date_nights_id_fk" FOREIGN KEY ("date_night_id") REFERENCES "public"."date_nights"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "date_night_slot_votes" ADD CONSTRAINT "date_night_slot_votes_date_night_id_date_nights_id_fk" FOREIGN KEY ("date_night_id") REFERENCES "public"."date_nights"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "date_night_slot_votes" ADD CONSTRAINT "date_night_slot_votes_slot_id_date_night_slots_id_fk" FOREIGN KEY ("slot_id") REFERENCES "public"."date_night_slots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "date_night_slot_votes" ADD CONSTRAINT "date_night_slot_votes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "date_night_options" ADD CONSTRAINT "date_night_options_date_night_id_date_nights_id_fk" FOREIGN KEY ("date_night_id") REFERENCES "public"."date_nights"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "date_night_options" ADD CONSTRAINT "date_night_options_title_id_titles_id_fk" FOREIGN KEY ("title_id") REFERENCES "public"."titles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "date_night_option_votes" ADD CONSTRAINT "date_night_option_votes_date_night_id_date_nights_id_fk" FOREIGN KEY ("date_night_id") REFERENCES "public"."date_nights"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "date_night_option_votes" ADD CONSTRAINT "date_night_option_votes_option_id_date_night_options_id_fk" FOREIGN KEY ("option_id") REFERENCES "public"."date_night_options"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "date_night_option_votes" ADD CONSTRAINT "date_night_option_votes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "date_night_slots_night_day_unique" ON "date_night_slots" USING btree ("date_night_id","day");--> statement-breakpoint
CREATE UNIQUE INDEX "date_night_options_night_title_unique" ON "date_night_options" USING btree ("date_night_id","title_id");
