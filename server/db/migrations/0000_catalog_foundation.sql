CREATE TABLE "game" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"provider_id" text NOT NULL,
	"description" text NOT NULL,
	"status" text NOT NULL,
	"is_featured" boolean DEFAULT false NOT NULL,
	"is_new" boolean DEFAULT false NOT NULL,
	"is_popular" boolean DEFAULT false NOT NULL,
	"released_at" timestamp with time zone NOT NULL,
	"popularity_score" integer NOT NULL,
	"sort_order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "game_category_check" CHECK ("game"."category" in ('slots', 'roulette', 'blackjack', 'baccarat', 'poker', 'arcade', 'gameshow', 'live')),
	CONSTRAINT "game_status_check" CHECK ("game"."status" in ('active', 'inactive'))
);
--> statement-breakpoint
CREATE TABLE "game_mode" (
	"id" text PRIMARY KEY NOT NULL,
	"game_id" text NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"kind" text NOT NULL,
	"engine_key" text NOT NULL,
	"paytable_key" text,
	"min_bet_minor" bigint NOT NULL,
	"max_bet_minor" bigint NOT NULL,
	"is_live_presentation" boolean DEFAULT false NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"sort_order" integer NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "game_mode_kind_check" CHECK ("game_mode"."kind" in ('variant', 'presentation')),
	CONSTRAINT "game_mode_engine_key_check" CHECK ("game_mode"."engine_key" in ('slot', 'roulette', 'blackjack', 'baccarat', 'videopoker', 'plinko', 'mines', 'dice', 'wheel')),
	CONSTRAINT "game_mode_status_check" CHECK ("game_mode"."status" in ('active', 'inactive'))
);
--> statement-breakpoint
CREATE TABLE "provider" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "game" ADD CONSTRAINT "game_provider_id_provider_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."provider"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_mode" ADD CONSTRAINT "game_mode_game_id_game_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."game"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "game_slug_unique" ON "game" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "game_mode_game_key_unique" ON "game_mode" USING btree ("game_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "game_mode_default_unique" ON "game_mode" USING btree ("game_id") WHERE "game_mode"."is_default" = true;