import { z } from "zod";
import type { AppDatabase } from "@/server/db/types";
import { countLedgerEntries, listDistinctGameModeIds, listLedgerEntries, listLedgerEntriesPage, type LedgerEntryRecord } from "@/server/repositories/ledger-repository";
import type { Transaction } from "@/types/transaction";
import { HISTORY_RANGE_VALUES, type HistoryRange } from "@/types/history";

export type { HistoryRange } from "@/types/history";

/**
 * Server-Lesepfad für die paginierte Spielhistorie (Auftrag §2). Wie
 * server/wallet/wallet-read-model.ts eine reine Funktion mit `db`/`userId` als Parameter, damit
 * sie unverändert gegen PGlite (Tests) und die echte Verbindung (app/(user)/history/page.tsx)
 * läuft.
 *
 * `userId` MUSS aus der geprüften Sitzung stammen (server/auth/guards.ts::getSession()) — diese
 * Funktion übernimmt sie nur, sie trifft keine eigene Autorisierungsentscheidung.
 */

/** Seitengröße — bewusst klein und fest, niemals vom Client bestimmbar (keine unbegrenzte Abfrage). */
export const HISTORY_PAGE_SIZE = 20;

const rangeMs: Record<Exclude<HistoryRange, "all">, number> = {
  today: 24 * 3_600_000,
  "7d": 7 * 24 * 3_600_000,
  "30d": 30 * 24 * 3_600_000,
};

/**
 * Validiert die aus der URL gelesenen Filter-/Paginierungs-Parameter (Auftrag: „Eingaben mit zod
 * validieren"). Alle Felder sind rohe Strings (wie sie `searchParams` liefert) oder fehlen ganz —
 * ein ungültiger Wert führt NICHT zu einem Fehlerzustand, sondern fällt auf den harmlosen Default
 * zurück (`.catch(...)`): eine falsch getippte URL soll die Historie nicht zum Absturz bringen,
 * sondern einfach die ungefilterte erste Seite zeigen.
 *
 * `cursors`: die komma-getrennte Kette der Keyset-Cursor (`seq`-Werte), mit der die aktuelle
 * Seite erreicht wurde — Seite 1 hat keine, Seite 3 zwei Einträge. Nur der LETZTE Wert bestimmt
 * die aktuelle Abfrage (`resolveLedgerHistoryPage`s `cursor`-Parameter); die vollständige Kette
 * braucht ausschließlich app/(user)/history/page.tsx, um den Link „Vorherige Seite" zu bauen
 * (einen Eintrag von der Kette abschneiden) — reine URL-Rekonstruktion, kein Zustand.
 */
export const historySearchParamsSchema = z.object({
  range: z
    .enum(HISTORY_RANGE_VALUES)
    .catch("all" as const),
  gameId: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .optional()
    .catch(undefined),
  cursors: z
    .string()
    .optional()
    .transform((v) => {
      if (!v) return [] as number[];
      return v
        .split(",")
        .map((s) => Number(s))
        .filter((n) => Number.isInteger(n) && n > 0);
    })
    .catch([] as number[]),
});

export type HistorySearchParams = z.infer<typeof historySearchParamsSchema>;

export interface LedgerHistoryPage {
  /**
   * Auf den bestehenden `Transaction`-Typ (types/transaction.ts) abgebildet statt des
   * Server-internen `LedgerEntryRecord` — dadurch können components/wallet/TransactionList.tsx
   * & Co. die Zeilen unverändert darstellen, ohne selbst aus `@/server/*` importieren zu müssen
   * (Schichtregel, eslint.config.mjs: components/** darf das nicht). Die Abbildung passiert hier,
   * bevor die Daten den Server-Layer verlassen.
   */
  entries: Transaction[];
  hasMore: boolean;
  /** Gesamtzahl unter den aktuellen Filtern — für die a11y-Statuszeile ("Seite 2, 45 Buchungen"). */
  total: number;
  /** Alle Spielmodi, in denen der Nutzer je gebucht hat (ungefiltert) — Grundlage des Spiel-Filters. */
  gameOptions: string[];
}

/** `game_mode.id` entspricht wortgleich der heutigen `Game.id` (server/db/schema.ts) → `gameId`. */
function toTransaction(entry: LedgerEntryRecord): Transaction {
  return {
    id: entry.id,
    seq: entry.seq,
    userId: entry.userId,
    type: entry.type,
    amountMinor: entry.amountMinor,
    balanceAfterMinor: entry.balanceAfterMinor,
    ...(entry.gameModeId !== null ? { gameId: entry.gameModeId } : {}),
    ...(entry.roundId !== null ? { roundId: entry.roundId } : {}),
    createdAt: entry.createdAt,
  };
}

function resolveCreatedAfterIso(range: HistoryRange): string | undefined {
  if (range === "all") return undefined;
  return new Date(Date.now() - rangeMs[range]).toISOString();
}

export interface ResolveLedgerHistoryPageParams {
  range?: HistoryRange;
  gameId?: string;
  cursor?: number;
}

export async function resolveLedgerHistoryPage(db: AppDatabase, userId: string | null, params: ResolveLedgerHistoryPageParams): Promise<LedgerHistoryPage> {
  if (userId === null) return { entries: [], hasMore: false, total: 0, gameOptions: [] };

  const filters = {
    ...(params.gameId !== undefined ? { gameModeId: params.gameId } : {}),
    ...(params.range !== undefined ? { createdAfterIso: resolveCreatedAfterIso(params.range) } : {}),
  };
  // undefined-Werte in filters (range: "all") werden von buildFilterConditions ignoriert.
  const cleanFilters = Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== undefined));

  const [page, total, gameOptions] = await Promise.all([
    listLedgerEntriesPage(db, userId, { limit: HISTORY_PAGE_SIZE, ...(params.cursor !== undefined ? { beforeSeq: params.cursor } : {}), ...cleanFilters }),
    countLedgerEntries(db, userId, cleanFilters),
    listDistinctGameModeIds(db, userId),
  ]);

  return { entries: page.entries.map(toTransaction), hasMore: page.hasMore, total, gameOptions };
}

/**
 * „Letzte Bewegungen" auf app/(user)/wallet: die letzten `limit` Buchungen ohne Filter und ohne
 * Paginierung (fester, kleiner Umfang — keine unbegrenzte Abfrage). Gäste ohne Sitzung erhalten
 * eine leere Liste statt eines Fehlers.
 */
export async function resolveRecentLedgerEntries(db: AppDatabase, userId: string | null, limit: number): Promise<Transaction[]> {
  if (userId === null) return [];
  const entries = await listLedgerEntries(db, userId, limit);
  return entries.map(toTransaction);
}
