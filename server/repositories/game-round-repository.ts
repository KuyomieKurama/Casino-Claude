import { and, eq } from "drizzle-orm";
import type { AppDatabase } from "@/server/db/types";
import { gameRound } from "@/server/db/schema";
import type { GameRoundStatus } from "@/server/db/enums";
import type { CreditsMinor } from "@/types/money";

/**
 * Game-Round-Repository (Auftrag §1, §3). `insertOpenRound` ist die Datenbankfassung von
 * Invariante 4 (nur eine Runde gleichzeitig) UND der Idempotenzschutz in einem Schritt: der
 * partielle Unique-Index `game_round_user_open_unique` (server/db/schema.ts) verhindert eine
 * zweite gleichzeitig offene Runde, der volle Unique-Index `game_round_user_idempotency_unique`
 * verhindert eine doppelte Buchung desselben Rundenstart-Versuchs.
 */

export interface GameRoundRecord {
  id: string;
  userId: string;
  gameModeId: string;
  betKey: string | null;
  stakeMinor: CreditsMinor;
  seed: number;
  status: GameRoundStatus;
  outcomeKey: string | null;
  returnMinor: CreditsMinor | null;
  maxReturnMinor: CreditsMinor;
  idempotencyKey: string;
  transcript: unknown;
  startedAt: string;
  settledAt: string | null;
}

export interface InsertOpenRoundInput {
  id: string;
  userId: string;
  gameModeId: string;
  betKey?: string;
  stakeMinor: CreditsMinor;
  seed: number;
  maxReturnMinor: CreditsMinor;
  idempotencyKey: string;
  transcript: unknown;
}

function toRecord(row: typeof gameRound.$inferSelect): GameRoundRecord {
  return {
    id: row.id,
    userId: row.userId,
    gameModeId: row.gameModeId,
    betKey: row.betKey,
    stakeMinor: row.stakeMinor,
    seed: row.seed,
    status: row.status,
    outcomeKey: row.outcomeKey,
    returnMinor: row.returnMinor,
    maxReturnMinor: row.maxReturnMinor,
    idempotencyKey: row.idempotencyKey,
    transcript: row.transcript,
    startedAt: row.startedAt.toISOString(),
    settledAt: row.settledAt ? row.settledAt.toISOString() : null,
  };
}

/**
 * `ON CONFLICT DO NOTHING` statt Lesen-dann-Einfügen: bei einer doppelten Anfrage (derselbe
 * Idempotenzschlüssel) blockiert PostgreSQL die zweite INSERT-Anweisung an der Zeilensperre des
 * Unique-Index, bis die erste Transaktion committet oder zurückrollt — danach liefert `DO
 * NOTHING` zuverlässig 0 Zeilen zurück, nie einen rohen Unique-Constraint-Fehler. `null` bedeutet
 * hier immer „schon vorhanden" (Doppelbuchung verhindert) ODER „es läuft bereits eine offene
 * Runde" (partieller Index) — der Aufrufer (server/rounds/round-service.ts) unterscheidet danach
 * per Nachschlagen anhand des Idempotenzschlüssels.
 */
export async function insertOpenRound(db: AppDatabase, input: InsertOpenRoundInput): Promise<GameRoundRecord | null> {
  const [row] = await db
    .insert(gameRound)
    .values({
      id: input.id,
      userId: input.userId,
      gameModeId: input.gameModeId,
      ...(input.betKey === undefined ? {} : { betKey: input.betKey }),
      stakeMinor: input.stakeMinor,
      seed: input.seed,
      status: "open",
      maxReturnMinor: input.maxReturnMinor,
      idempotencyKey: input.idempotencyKey,
      transcript: input.transcript,
    })
    .onConflictDoNothing()
    .returning();
  return row ? toRecord(row) : null;
}

export async function findByIdempotencyKey(db: AppDatabase, userId: string, idempotencyKey: string): Promise<GameRoundRecord | null> {
  const [row] = await db
    .select()
    .from(gameRound)
    .where(and(eq(gameRound.userId, userId), eq(gameRound.idempotencyKey, idempotencyKey)))
    .limit(1);
  return row ? toRecord(row) : null;
}

export interface SettleRoundInput {
  outcomeKey: string;
  returnMinor: CreditsMinor;
  transcript: unknown;
}

/**
 * Schließt eine offene Runde ab. `WHERE status = 'open'` ist eine zusätzliche Absicherung gegen
 * ein versehentliches doppeltes Settle (z. B. ein Programmierfehler, der denselben Aufruf
 * zweimal auslöst) — ein bereits abgeschlossener Datensatz wird nie ein zweites Mal verändert.
 */
export async function settleRound(db: AppDatabase, roundId: string, input: SettleRoundInput): Promise<GameRoundRecord> {
  const [row] = await db
    .update(gameRound)
    .set({
      status: "settled",
      outcomeKey: input.outcomeKey,
      returnMinor: input.returnMinor,
      transcript: input.transcript,
      settledAt: new Date(),
    })
    .where(and(eq(gameRound.id, roundId), eq(gameRound.status, "open")))
    .returning();
  if (!row) throw new Error(`Runde „${roundId}" konnte nicht abgeschlossen werden (nicht gefunden oder nicht mehr offen).`);
  return toRecord(row);
}
