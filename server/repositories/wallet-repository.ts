import { sql } from "drizzle-orm";
import { eq } from "drizzle-orm";
import type { AppDatabase } from "@/server/db/types";
import { wallet } from "@/server/db/schema";
import type { CreditsMinor } from "@/types/money";

/**
 * Wallet-Repository (Phase 3a, Auftrag §2): der materialisierte Saldo. Der eigentliche Schutz
 * gegen Wettläufe liegt NICHT in dieser Datei als Anwendungslogik (kein Lesen-dann-Schreiben),
 * sondern in den WHERE-Bedingungen der bedingten UPDATE-Anweisungen unten — PostgreSQL
 * serialisiert konkurrierende UPDATEs auf dieselbe Zeile über deren Zeilensperre, sodass eine
 * zweite Transaktion die WHERE-Bedingung immer gegen den zuletzt COMMITteten Stand prüft
 * (READ COMMITTED, „EvalPlanQual"), nicht gegen einen zu Beginn gelesenen, potenziell
 * veralteten Wert.
 */

export interface WalletRecord {
  userId: string;
  demoBalanceMinor: CreditsMinor;
  bonusBalanceMinor: CreditsMinor;
  freeSpins: number;
  nextSeq: number;
  updatedAt: string;
}

function toRecord(row: typeof wallet.$inferSelect): WalletRecord {
  return {
    userId: row.userId,
    demoBalanceMinor: row.demoBalanceMinor,
    bonusBalanceMinor: row.bonusBalanceMinor,
    freeSpins: row.freeSpins,
    nextSeq: row.nextSeq,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function findWallet(db: AppDatabase, userId: string): Promise<WalletRecord | null> {
  const [row] = await db.select().from(wallet).where(eq(wallet.userId, userId)).limit(1);
  return row ? toRecord(row) : null;
}

/**
 * Legt das Wallet an, falls es noch nicht existiert — `ON CONFLICT DO NOTHING` statt
 * Lesen-dann-Einfügen, damit zwei gleichzeitige erste Zugriffe (z. B. zwei Tabs desselben neuen
 * Kontos) nicht in eine doppelte Anlage laufen. `nextSeq` startet bei 2: Sequenznummer 1 ist für
 * die Startguthaben-Buchung reserviert, die der Aufrufer (server/rounds/round-service.ts) bei
 * `created: true` in DERSELBEN Transaktion als Ledger-Eintrag nachträgt (Auftrag §7 — das
 * Startguthaben ist eine Buchung, kein stiller Anfangswert).
 */
export async function insertWalletIfMissing(
  db: AppDatabase,
  userId: string,
  startDemoBalanceMinor: CreditsMinor,
): Promise<{ walletRecord: WalletRecord; created: boolean }> {
  const [inserted] = await db
    .insert(wallet)
    .values({ userId, demoBalanceMinor: startDemoBalanceMinor, bonusBalanceMinor: 0, freeSpins: 0, nextSeq: 2 })
    .onConflictDoNothing({ target: wallet.userId })
    .returning();
  if (inserted) return { walletRecord: toRecord(inserted), created: true };

  const existing = await findWallet(db, userId);
  if (!existing) {
    // Kann praktisch nicht eintreten (der Konflikt beweist, dass eine Zeile existiert), aber ein
    // stiller Fallback bei einer Geldbewegung ist ausdrücklich untersagt — deshalb ein klarer Fehler.
    throw new Error(`Wallet für Nutzer „${userId}" konnte nach Konflikt nicht gelesen werden.`);
  }
  return { walletRecord: existing, created: false };
}

export type DebitResult = { ok: true; walletRecord: WalletRecord } | { ok: false };

/**
 * Bucht einen Einsatz mit dem im Auftrag vorgegebenen bedingten UPDATE. `fromBonusMinor` und
 * `fromDemoMinor` kommen aus `lib/wallet-policy.ts::splitStakeAcrossBalances` (dieselbe Regel wie
 * im Client-Reducer). Null betroffene Zeilen ⇒ `{ ok: false }` — der Aufrufer wertet das als
 * `INSUFFICIENT_FUNDS` und rollt die gesamte Transaktion zurück (Invariante 1: Einsätze über dem
 * Bestand werden abgelehnt, nicht gekappt).
 */
export async function debitForStake(
  db: AppDatabase,
  userId: string,
  input: { fromBonusMinor: CreditsMinor; fromDemoMinor: CreditsMinor },
): Promise<DebitResult> {
  const [row] = await db
    .update(wallet)
    .set({
      bonusBalanceMinor: sql`${wallet.bonusBalanceMinor} - ${input.fromBonusMinor}`,
      demoBalanceMinor: sql`${wallet.demoBalanceMinor} - ${input.fromDemoMinor}`,
      nextSeq: sql`${wallet.nextSeq} + 1`,
      updatedAt: new Date(),
    })
    .where(
      sql`${wallet.userId} = ${userId} AND ${wallet.bonusBalanceMinor} >= ${input.fromBonusMinor} AND ${wallet.demoBalanceMinor} >= ${input.fromDemoMinor}`,
    )
    .returning();
  return row ? { ok: true, walletRecord: toRecord(row) } : { ok: false };
}

/**
 * Verbraucht eine Freirunde mit demselben bedingten Muster wie `debitForStake` — kein
 * Lesen-dann-Schreiben, die WHERE-Bedingung ist der Schutz.
 */
export async function consumeFreeSpin(db: AppDatabase, userId: string): Promise<DebitResult> {
  const [row] = await db
    .update(wallet)
    .set({ freeSpins: sql`${wallet.freeSpins} - 1`, nextSeq: sql`${wallet.nextSeq} + 1`, updatedAt: new Date() })
    .where(sql`${wallet.userId} = ${userId} AND ${wallet.freeSpins} >= 1`)
    .returning();
  return row ? { ok: true, walletRecord: toRecord(row) } : { ok: false };
}

/**
 * Schreibt eine Rückgabe gut, gedeckelt auf `maxBalanceMinor` (Invariante 7). Anders als der
 * Einsatz braucht eine Gutschrift keine WHERE-Bedingung gegen ein Unterschreiten — sie kann nur
 * gegen die Obergrenze laufen, und `LEAST(...)` deckelt das direkt in der Anweisung, statt den
 * CHECK-Constraint (server/db/schema.ts) auszulösen und die Transaktion abzubrechen.
 */
export async function creditReturn(
  db: AppDatabase,
  userId: string,
  amountMinor: CreditsMinor,
  maxBalanceMinor: CreditsMinor,
): Promise<WalletRecord> {
  const [row] = await db
    .update(wallet)
    .set({
      demoBalanceMinor: sql`LEAST(${wallet.demoBalanceMinor} + ${amountMinor}, ${maxBalanceMinor})`,
      nextSeq: sql`${wallet.nextSeq} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(wallet.userId, userId))
    .returning();
  if (!row) throw new Error(`Wallet für Nutzer „${userId}" existiert nicht — Rückgabe kann nicht gebucht werden.`);
  return toRecord(row);
}
