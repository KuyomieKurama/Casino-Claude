CREATE TABLE "game_round_action" (
	"id" text PRIMARY KEY NOT NULL,
	"round_id" text NOT NULL,
	"seq" integer NOT NULL,
	"action" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "game_round_action_action_check" CHECK ("game_round_action"."action" in ('hit', 'stand', 'double', 'split', 'reveal', 'cashOut', 'draw')),
	CONSTRAINT "game_round_action_seq_check" CHECK ("game_round_action"."seq" >= 1)
);
--> statement-breakpoint
ALTER TABLE "game_round_action" ADD CONSTRAINT "game_round_action_round_id_game_round_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."game_round"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "game_round_action_round_seq_unique" ON "game_round_action" USING btree ("round_id","seq");