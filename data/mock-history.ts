import type { Transaction } from "@/types/transaction";
import type { CreditsMinor } from "@/types/money";

/**
 * Vorbefüllte Beispielhistorie (§10), damit Historie und Kennzahlen beim ersten Start
 * nicht leer wirken. Als Beispieldaten gekennzeichnet (id-Präfix "sample_"), die Kette
 * beginnt bei einem eigenen, von der echten Startguthaben-Konstante UNABHÄNGIGEN Beispielwert
 * und endet exakt wieder dort (Summe aller weiteren Beträge ist 0) — reine Anzeige-Beispieldaten,
 * kein echter Wallet-Seed mehr (siehe state/WalletContext.tsx, „Kein sampleTransactions-Seed
 * mehr"). `data/**` darf laut Schichtregel nicht aus `lib/constants` importieren, deshalb bewusst
 * KEIN Bezug auf `START_BALANCE_MINOR` hier — wer beide Werte in einem Test gemeinsam braucht
 * (state/wallet-reducer.test.ts), gleicht sie dort gezielt ab.
 *
 * `balanceAfterMinor` steht bewusst NICHT als eigene Spalte in `rows`: ein hartkodierter
 * Absolutwert je Zeile müsste bei jeder Änderung des Startwerts unten manuell nachgezogen werden
 * — genau die Art stiller Drift, die state/wallet-reducer.test.ts aufdeckt. Stattdessen trägt
 * jede Zeile nur ihren Delta-Betrag; der laufende Saldo wird unten einmalig fortgeschrieben.
 */
export const SAMPLE_PREFIX = "sample_";

export function isSampleTransaction(tx: Pick<Transaction, "id">): boolean {
  return tx.id.startsWith(SAMPLE_PREFIX);
}

const base = new Date("2026-08-14T18:02:00").getTime();
const at = (minutes: number) => new Date(base + minutes * 60_000).toISOString();
const NN = "g-neon-nights";

/** Eigenständiger Beispiel-Startwert für diese Demo-Historie, siehe Dateikommentar oben. */
const SAMPLE_START_BALANCE_MINOR: CreditsMinor = 100_000;

type Row = [seq: number, type: Transaction["type"], amount: CreditsMinor, minute: number, gameId?: string, roundId?: string];

const rows: Row[] = [
  [1, "demo_credit", SAMPLE_START_BALANCE_MINOR, 0],
  [2, "demo_bet", -100, 3, NN, "sample_r1"],
  [3, "demo_win", 200, 3, NN, "sample_r1"],
  [4, "demo_bet", -100, 4, NN, "sample_r2"],
  [5, "demo_win", 0, 4, NN, "sample_r2"],
  [6, "demo_bet", -50, 5, NN, "sample_r3"],
  [7, "demo_win", 25, 5, NN, "sample_r3"],
  [8, "demo_bet", -100, 6, NN, "sample_r4"],
  [9, "demo_win", 500, 6, NN, "sample_r4"],
  [10, "demo_bet", -100, 7, NN, "sample_r5"],
  [11, "demo_win", 0, 7, NN, "sample_r5"],
  [12, "demo_bet", -100, 8, NN, "sample_r6"],
  [13, "demo_win", 0, 8, NN, "sample_r6"],
  [14, "demo_bet", -100, 9, NN, "sample_r7"],
  [15, "demo_win", 0, 9, NN, "sample_r7"],
  [16, "demo_bet", -75, 11, NN, "sample_r8"],
  [17, "demo_win", 0, 11, NN, "sample_r8"],
];

let runningBalance = 0;
export const sampleTransactions: readonly Transaction[] = rows.map(([seq, type, amountMinor, minute, gameId, roundId]) => {
  runningBalance += amountMinor;
  return {
    id: `${SAMPLE_PREFIX}tx_${seq}`,
    seq,
    userId: "guest",
    type,
    amountMinor,
    balanceAfterMinor: runningBalance,
    ...(gameId ? { gameId } : {}),
    ...(roundId ? { roundId } : {}),
    createdAt: at(minute),
    isDemo: true as const,
  };
});
