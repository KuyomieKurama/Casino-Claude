ALTER TABLE "wallet" RENAME COLUMN "demo_balance_minor" TO "balance_minor";--> statement-breakpoint
ALTER TABLE "wallet" RENAME CONSTRAINT "wallet_demo_balance_check" TO "wallet_balance_check";--> statement-breakpoint
ALTER TABLE "ledger_entry" RENAME COLUMN "from_demo_minor" TO "from_balance_minor";--> statement-breakpoint
ALTER TABLE "ledger_entry" DROP CONSTRAINT "ledger_entry_type_check";--> statement-breakpoint
UPDATE "ledger_entry" SET "type" = 'credit' WHERE "type" = 'demo_credit';--> statement-breakpoint
UPDATE "ledger_entry" SET "type" = 'bet' WHERE "type" = 'demo_bet';--> statement-breakpoint
UPDATE "ledger_entry" SET "type" = 'win' WHERE "type" = 'demo_win';--> statement-breakpoint
ALTER TABLE "ledger_entry" ADD CONSTRAINT "ledger_entry_type_check" CHECK ("ledger_entry"."type" in ('credit', 'bet', 'win', 'bonus_grant', 'free_spin', 'reset'));
