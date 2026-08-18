import { and, desc, eq, sql } from "drizzle-orm";
import type { AppDatabase } from "@/server/db/types";
import { ledgerEntry } from "@/server/db/schema";
import type { LedgerEntryType } from "@/server/db/enums";
import type { CreditsMinor } from "@/types/money";

/**
 * Ledger-Repository (Auftrag §1): Append-only. Es gibt hier bewusst keine `update`/`delete`-
 * Funktion — jede Guthabenänderung erzeugt genau eine neue Zeile (Invariante 2), niemals eine
 * Änderung an einer bestehenden.
 */

export interface LedgerEntryRecord {
  id: string;
  userId: string;
  seq: number;
  type: LedgerEntryType;
  amountMinor: CreditsMinor;
  balanceAfterMinor: CreditsMinor;
  fromDemoMinor: CreditsMinor | null;
  fromBonusMinor: CreditsMinor | null;
  gameModeId: string | null;
  roundId: string | null;
  createdAt: string;
}

export interface InsertLedgerEntryInput {
  id?: string;
  userId: string;
  seq: number;
  type: LedgerEntryType;
  amountMinor: CreditsMinor;
  balanceAfterMinor: CreditsMinor;
  fromDemoMinor?: CreditsMinor;
  fromBonusMinor?: CreditsMinor;
  gameModeId?: string;
  roundId?: string;
}

function toRecord(row: typeof ledgerEntry.$inferSelect): LedgerEntryRecord {
  return {
    id: row.id,
    userId: row.userId,
    seq: row.seq,
    type: row.type,
    amountMinor: row.amountMinor,
    balanceAfterMinor: row.balanceAfterMinor,
    fromDemoMinor: row.fromDemoMinor,
    fromBonusMinor: row.fromBonusMinor,
    gameModeId: row.gameModeId,
    roundId: row.roundId,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function insertLedgerEntry(db: AppDatabase, input: InsertLedgerEntryInput): Promise<LedgerEntryRecord> {
  const [row] = await db
    .insert(ledgerEntry)
    .values({
      id: input.id ?? crypto.randomUUID(),
      userId: input.userId,
      seq: input.seq,
      type: input.type,
      amountMinor: input.amountMinor,
      balanceAfterMinor: input.balanceAfterMinor,
      ...(input.fromDemoMinor === undefined ? {} : { fromDemoMinor: input.fromDemoMinor }),
      ...(input.fromBonusMinor === undefined ? {} : { fromBonusMinor: input.fromBonusMinor }),
      ...(input.gameModeId === undefined ? {} : { gameModeId: input.gameModeId }),
      ...(input.roundId === undefined ? {} : { roundId: input.roundId }),
    })
    .returning();
  if (!row) throw new Error(`Ledger-Eintrag für Nutzer „${input.userId}" (seq ${input.seq}) konnte nicht gespeichert werden.`);
  return toRecord(row);
}

export async function listLedgerEntries(db: AppDatabase, userId: string, limit = 100): Promise<LedgerEntryRecord[]> {
  const rows = await db.select().from(ledgerEntry).where(eq(ledgerEntry.userId, userId)).orderBy(desc(ledgerEntry.seq)).limit(limit);
  return rows.map(toRecord);
}

/**
 * Summe aller Ledger-Beträge eines Nutzers — Grundlage des Konsistenztests (Auftrag §8): Diese
 * Summe muss jederzeit dem materialisierten `wallet`-Saldo (Demo- plus Bonusguthaben) entsprechen.
 * `NULL` (keine Zeilen) wird als 0 behandelt, nicht als Rechenfehler weitergereicht.
 */
export async function sumLedgerAmountForUser(db: AppDatabase, userId: string): Promise<number> {
  const [row] = await db
    .select({ total: sql<string | null>`COALESCE(SUM(${ledgerEntry.amountMinor}), 0)` })
    .from(ledgerEntry)
    .where(and(eq(ledgerEntry.userId, userId)));
  return Number(row?.total ?? 0);
}
