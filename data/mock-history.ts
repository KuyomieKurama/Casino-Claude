import type { Transaction } from "@/types/transaction";
import type { CreditsMinor } from "@/types/money";

/**
 * Vorbefüllte Beispielhistorie (§10), damit Historie und Kennzahlen beim ersten Start
 * nicht leer wirken. Als Beispieldaten gekennzeichnet (id-Präfix "sample_"), die Kette
 * beginnt beim Startguthaben und endet exakt wieder bei 1.000,00 Credits, damit
 * Startguthaben und letzte balanceAfterMinor konsistent sind.
 */
export const SAMPLE_PREFIX = "sample_";

export function isSampleTransaction(tx: Pick<Transaction, "id">): boolean {
  return tx.id.startsWith(SAMPLE_PREFIX);
}

const base = new Date("2026-08-14T18:02:00").getTime();
const at = (minutes: number) => new Date(base + minutes * 60_000).toISOString();
const NN = "g-neon-nights";

type Row = [
  seq: number,
  type: Transaction["type"],
  amount: CreditsMinor,
  after: CreditsMinor,
  minute: number,
  gameId?: string,
  roundId?: string,
];

const rows: Row[] = [
  [1, "demo_credit", 100_000, 100_000, 0],
  [2, "demo_bet", -100, 99_900, 3, NN, "sample_r1"],
  [3, "demo_win", 200, 100_100, 3, NN, "sample_r1"],
  [4, "demo_bet", -100, 100_000, 4, NN, "sample_r2"],
  [5, "demo_win", 0, 100_000, 4, NN, "sample_r2"],
  [6, "demo_bet", -50, 99_950, 5, NN, "sample_r3"],
  [7, "demo_win", 25, 99_975, 5, NN, "sample_r3"],
  [8, "demo_bet", -100, 99_875, 6, NN, "sample_r4"],
  [9, "demo_win", 500, 100_375, 6, NN, "sample_r4"],
  [10, "demo_bet", -100, 100_275, 7, NN, "sample_r5"],
  [11, "demo_win", 0, 100_275, 7, NN, "sample_r5"],
  [12, "demo_bet", -100, 100_175, 8, NN, "sample_r6"],
  [13, "demo_win", 0, 100_175, 8, NN, "sample_r6"],
  [14, "demo_bet", -100, 100_075, 9, NN, "sample_r7"],
  [15, "demo_win", 0, 100_075, 9, NN, "sample_r7"],
  [16, "demo_bet", -75, 100_000, 11, NN, "sample_r8"],
  [17, "demo_win", 0, 100_000, 11, NN, "sample_r8"],
];

export const sampleTransactions: readonly Transaction[] = rows.map(
  ([seq, type, amountMinor, balanceAfterMinor, minute, gameId, roundId]) => ({
    id: `${SAMPLE_PREFIX}tx_${seq}`,
    seq,
    userId: "guest",
    type,
    amountMinor,
    balanceAfterMinor,
    ...(gameId ? { gameId } : {}),
    ...(roundId ? { roundId } : {}),
    createdAt: at(minute),
    isDemo: true as const,
  }),
);

/** Beispiel-Kennzahlen für das Admin-Dashboard (M3), gekennzeichnet als Mock. */
export const sampleAdminMetrics = {
  isSample: true,
  demoSessionsToday: 42,
  roundsToday: 1_318,
  activeGames: 23,
  inactiveGames: 1,
  simulatedErrorsToday: 3,
} as const;
