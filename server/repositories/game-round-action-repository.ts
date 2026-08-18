import { asc, eq } from "drizzle-orm";
import type { AppDatabase } from "@/server/db/types";
import { gameRoundAction } from "@/server/db/schema";
import type { GameRoundActionName } from "@/server/db/enums";

/**
 * Repository für das Aktionsprotokoll interaktiver Runden (Phase 3b, Auftrag §1). Append-only —
 * wie `ledger-repository.ts` gibt es hier bewusst keine Update-/Delete-Funktion.
 */

export interface GameRoundActionRecord {
  id: string;
  roundId: string;
  seq: number;
  action: GameRoundActionName;
  payload: unknown;
  createdAt: string;
}

export interface InsertRoundActionInput {
  id: string;
  roundId: string;
  seq: number;
  action: GameRoundActionName;
  payload: unknown;
}

function toRecord(row: typeof gameRoundAction.$inferSelect): GameRoundActionRecord {
  return {
    id: row.id,
    roundId: row.roundId,
    seq: row.seq,
    action: row.action,
    payload: row.payload,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * `ON CONFLICT DO NOTHING` statt Lesen-dann-Einfügen — derselbe Grund wie bei
 * `insertOpenRound` (game-round-repository.ts): der Unique-Index `game_round_action_round_seq_
 * unique` ist die eigentliche Idempotenzsicherung. `null` bedeutet „diese Position (round_id, seq)
 * ist bereits belegt" — der Aufrufer (server/rounds/round-action-service.ts) unterscheidet danach,
 * ob es sich um einen identischen Wiederholungsversuch oder einen echten Konflikt handelt.
 */
export async function insertRoundAction(db: AppDatabase, input: InsertRoundActionInput): Promise<GameRoundActionRecord | null> {
  const [row] = await db
    .insert(gameRoundAction)
    .values({ id: input.id, roundId: input.roundId, seq: input.seq, action: input.action, payload: input.payload })
    .onConflictDoNothing()
    .returning();
  return row ? toRecord(row) : null;
}

/** Vollständiges Protokoll einer Runde, aufsteigend nach Position — Grundlage jeder Zustandsableitung. */
export async function findActionsForRound(db: AppDatabase, roundId: string): Promise<GameRoundActionRecord[]> {
  const rows = await db.select().from(gameRoundAction).where(eq(gameRoundAction.roundId, roundId)).orderBy(asc(gameRoundAction.seq));
  return rows.map(toRecord);
}
