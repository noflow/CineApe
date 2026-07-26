CREATE TABLE "group_pick_reactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_pick_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"emoji" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "group_pick_reactions" ADD CONSTRAINT "group_pick_reactions_group_pick_id_group_title_picks_id_fk" FOREIGN KEY ("group_pick_id") REFERENCES "public"."group_title_picks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_pick_reactions" ADD CONSTRAINT "group_pick_reactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "group_pick_reactions_pick_user_unique" ON "group_pick_reactions" USING btree ("group_pick_id","user_id");