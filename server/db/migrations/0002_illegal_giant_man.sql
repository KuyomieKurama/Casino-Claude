CREATE TABLE "game_round" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"game_mode_id" text NOT NULL,
	"bet_key" text,
	"stake_minor" bigint NOT NULL,
	"seed" integer NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"outcome_key" text,
	"return_minor" bigint,
	"max_return_minor" bigint NOT NULL,
	"idempotency_key" text NOT NULL,
	"transcript" jsonb NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"settled_at" timestamp with time zone,
	CONSTRAINT "game_round_status_check" CHECK ("game_round"."status" in ('open', 'settled', 'voided')),
	CONSTRAINT "game_round_stake_check" CHECK ("game_round"."stake_minor" >= 0),
	CONSTRAINT "game_round_return_check" CHECK ("game_round"."return_minor" IS NULL OR "game_round"."return_minor" >= 0),
	CONSTRAINT "game_round_max_return_check" CHECK ("game_round"."max_return_minor" >= 0)
);
--> statement-breakpoint
CREATE TABLE "ledger_entry" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"seq" bigint NOT NULL,
	"type" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"balance_after_minor" bigint NOT NULL,
	"from_demo_minor" bigint,
	"from_bonus_minor" bigint,
	"game_mode_id" text,
	"round_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_entry_type_check" CHECK ("ledger_entry"."type" in ('demo_credit', 'demo_bet', 'demo_win', 'bonus_grant', 'free_spin', 'reset'))
);
--> statement-breakpoint
CREATE TABLE "wallet" (
	"user_id" text PRIMARY KEY NOT NULL,
	"demo_balance_minor" bigint DEFAULT 0 NOT NULL,
	"bonus_balance_minor" bigint DEFAULT 0 NOT NULL,
	"free_spins" integer DEFAULT 0 NOT NULL,
	"next_seq" bigint DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wallet_demo_balance_check" CHECK ("wallet"."demo_balance_minor" >= 0 AND "wallet"."demo_balance_minor" <= 9999999999),
	CONSTRAINT "wallet_bonus_balance_check" CHECK ("wallet"."bonus_balance_minor" >= 0 AND "wallet"."bonus_balance_minor" <= 9999999999),
	CONSTRAINT "wallet_free_spins_check" CHECK ("wallet"."free_spins" >= 0),
	CONSTRAINT "wallet_next_seq_check" CHECK ("wallet"."next_seq" >= 1)
);
--> statement-breakpoint
ALTER TABLE "game_round" ADD CONSTRAINT "game_round_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_round" ADD CONSTRAINT "game_round_game_mode_id_game_mode_id_fk" FOREIGN KEY ("game_mode_id") REFERENCES "public"."game_mode"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entry" ADD CONSTRAINT "ledger_entry_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entry" ADD CONSTRAINT "ledger_entry_game_mode_id_game_mode_id_fk" FOREIGN KEY ("game_mode_id") REFERENCES "public"."game_mode"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entry" ADD CONSTRAINT "ledger_entry_round_id_game_round_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."game_round"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet" ADD CONSTRAINT "wallet_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "game_round_user_idempotency_unique" ON "game_round" USING btree ("user_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "game_round_user_open_unique" ON "game_round" USING btree ("user_id") WHERE "game_round"."status" = 'open';--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_entry_user_seq_unique" ON "ledger_entry" USING btree ("user_id","seq");