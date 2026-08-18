CREATE TABLE "play_session" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_active_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"last_reminder_at" timestamp with time zone,
	CONSTRAINT "play_session_active_after_start_check" CHECK ("play_session"."last_active_at" >= "play_session"."started_at")
);
--> statement-breakpoint
CREATE TABLE "rg_setting" (
	"user_id" text PRIMARY KEY NOT NULL,
	"session_limit_minutes" integer,
	"reminder_interval_minutes" integer DEFAULT 30 NOT NULL,
	"paused_until" timestamp with time zone,
	"self_excluded" boolean DEFAULT false NOT NULL,
	"self_excluded_at" timestamp with time zone,
	"lift_requested_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rg_setting_session_limit_check" CHECK ("rg_setting"."session_limit_minutes" IS NULL OR "rg_setting"."session_limit_minutes" > 0),
	CONSTRAINT "rg_setting_reminder_interval_check" CHECK ("rg_setting"."reminder_interval_minutes" > 0)
);
--> statement-breakpoint
ALTER TABLE "play_session" ADD CONSTRAINT "play_session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rg_setting" ADD CONSTRAINT "rg_setting_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "play_session_user_active_unique" ON "play_session" USING btree ("user_id") WHERE "play_session"."ended_at" IS NULL;