import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
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
  fromBalanceMinor: CreditsMinor | null;
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
  fromBalanceMinor?: CreditsMinor;
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
    fromBalanceMinor: row.fromBalanceMinor,
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
      ...(input.fromBalanceMinor === undefined ? {} : { fromBalanceMinor: input.fromBalanceMinor }),
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
 * Gemeinsame Filter für die paginierte Historie (Auftrag §2/§3, app/(user)/history): immer
 * scharf auf `userId` (die geprüfte Sitzung, nie eine Angabe aus der Anfrage), optional auf
 * Spielmodus und Zeitraum eingeschränkt.
 */
export interface LedgerEntryFilters {
  gameModeId?: string;
  /** Nur Einträge ab diesem Zeitpunkt (ISO), für die Zeitraum-Filter (heute/7 Tage/30 Tage). */
  createdAfterIso?: string;
}

function buildFilterConditions(userId: string, filters: LedgerEntryFilters) {
  const conditions = [eq(ledgerEntry.userId, userId)];
  if (filters.gameModeId !== undefined) conditions.push(eq(ledgerEntry.gameModeId, filters.gameModeId));
  if (filters.createdAfterIso !== undefined) conditions.push(gte(ledgerEntry.createdAt, new Date(filters.createdAfterIso)));
  return conditions;
}

export interface ListLedgerEntriesPageOptions extends LedgerEntryFilters {
  /** Seitengröße — vom Aufrufer (server/wallet/ledger-history.ts) auf eine feste Obergrenze geprüft. */
  limit: number;
  /** Keyset-Cursor: nur Einträge MIT kleinerer seq als dieser Wert (die nächstälteren). Ohne
   *  Angabe beginnt die Ausgabe bei der neuesten Zeile — kein OFFSET, keine unbegrenzte Abfrage. */
  beforeSeq?: number;
}

export interface LedgerEntriesPage {
  entries: LedgerEntryRecord[];
  /** true, wenn nach dieser Seite (unter denselben Filtern) noch ältere Einträge existieren. */
  hasMore: boolean;
}

/**
 * Paginierte Historie (Auftrag §2): Keyset-Pagination über `seq` (monoton je Nutzer, siehe
 * server/db/schema.ts::ledgerEntry) statt OFFSET — bleibt bei wachsender Historie konstant
 * schnell und liefert bei gleichzeitigen neuen Buchungen keine verschobenen/doppelten Zeilen.
 * Lädt genau `limit + 1` Zeilen, um `hasMore` ohne separate COUNT-Abfrage zu bestimmen, und
 * gibt nie mehr als `limit` Zeilen zurück.
 */
export async function listLedgerEntriesPage(db: AppDatabase, userId: string, options: ListLedgerEntriesPageOptions): Promise<LedgerEntriesPage> {
  const conditions = buildFilterConditions(userId, options);
  if (options.beforeSeq !== undefined) conditions.push(lt(ledgerEntry.seq, options.beforeSeq));

  const rows = await db
    .select()
    .from(ledgerEntry)
    .where(and(...conditions))
    .orderBy(desc(ledgerEntry.seq))
    .limit(options.limit + 1);

  const hasMore = rows.length > options.limit;
  const page = hasMore ? rows.slice(0, options.limit) : rows;
  return { entries: page.map(toRecord), hasMore };
}

/**
 * Gesamtzahl der (gefilterten) Einträge — eine einzelne aggregierte Zeile, kein Laden aller
 * Datensätze. Dient ausschließlich der Anzeige ("Seite 2 von 3, 45 Buchungen") für Screenreader
 * und ist kein Ersatz für `listLedgerEntriesPage`s Keyset-Pagination.
 */
export async function countLedgerEntries(db: AppDatabase, userId: string, filters: LedgerEntryFilters): Promise<number> {
  const conditions = buildFilterConditions(userId, filters);
  const [row] = await db
    .select({ total: sql<string>`COUNT(*)` })
    .from(ledgerEntry)
    .where(and(...conditions));
  return Number(row?.total ?? 0);
}

/**
 * Distinkte Spielmodi, in denen der Nutzer jemals eine Buchung hatte — Grundlage für den
 * „Spiel"-Filter der Historie (nur Modi zeigen, in denen tatsächlich etwas passiert ist, wie
 * zuvor beim lokalen Reducer). Begrenzt durch die Zahl der Kataloge-Modi (§Auftrag: 24 Titel),
 * keine unbegrenzte Ergebnismenge.
 */
export async function listDistinctGameModeIds(db: AppDatabase, userId: string): Promise<string[]> {
  const rows = await db
    .selectDistinct({ gameModeId: ledgerEntry.gameModeId })
    .from(ledgerEntry)
    .where(eq(ledgerEntry.userId, userId));
  return rows.map((r) => r.gameModeId).filter((id): id is string => id !== null);
}

/**
 * Summe aller Ledger-Beträge eines Nutzers — Grundlage des Konsistenztests (Auftrag §8): Diese
 * Summe muss jederzeit dem materialisierten `wallet`-Saldo (Guthaben plus Bonusguthaben) entsprechen.
 * `NULL` (keine Zeilen) wird als 0 behandelt, nicht als Rechenfehler weitergereicht.
 */
export async function sumLedgerAmountForUser(db: AppDatabase, userId: string): Promise<number> {
  const [row] = await db
    .select({ total: sql<string | null>`COALESCE(SUM(${ledgerEntry.amountMinor}), 0)` })
    .from(ledgerEntry)
    .where(and(eq(ledgerEntry.userId, userId)));
  return Number(row?.total ?? 0);
}
