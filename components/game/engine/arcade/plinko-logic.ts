import type { EngineOutcome } from "@/types/engine";
import type { PaytableEntry } from "@/types/game-round";
import { mulberry32 } from "@/lib/rng";
import {
  PLINKO_BUCKET_COUNT,
  PLINKO_ROWS,
  plinkoMultiplier,
  plinkoPaytable,
} from "@/data/paytables/arcade";

/**
 * Plinko Demo — Fachlogik, rein und ohne React.
 *
 * Ablauf einer Runde: Die Kugel fällt durch 12 Nagelreihen. In jeder Reihe fällt genau eine
 * Links-/Rechts-Entscheidung aus dem gesäten PRNG (lib/rng, mulberry32). Das Fach ist die Anzahl
 * der Rechts-Entscheidungen — daraus ergibt sich die Binomialverteilung C(12,k)/4096 von selbst,
 * ohne dass eine Verteilung nachträglich „gezogen“ werden müsste.
 *
 * Kein Risikoregler: Die Spielbeschreibung in data/games.ts sagt ausdrücklich „ohne Risikoregler“,
 * also gibt es genau ein Nagelbrett und genau eine Auszahlungstabelle.
 */

export type PlinkoStep = "L" | "R";

export type PlinkoRound = {
  /** Die 12 Entscheidungen in Fallreihenfolge. */
  path: PlinkoStep[];
  /** Fach 0 … 12 (Anzahl der Rechts-Entscheidungen). */
  bucket: number;
  multiplier: number;
  entry: PaytableEntry;
  returnMinor: number;
};

/** Position der Kugel nach i Reihen = Anzahl der bisherigen Rechts-Entscheidungen. */
export function plinkoPositions(path: readonly PlinkoStep[]): number[] {
  const positions: number[] = [0];
  let p = 0;
  for (const step of path) {
    if (step === "R") p += 1;
    positions.push(p);
  }
  return positions;
}

/** Der Weg der Kugel, deterministisch aus dem Rundenseed. */
export function plinkoPath(seed: number): PlinkoStep[] {
  const rng = mulberry32(seed);
  const path: PlinkoStep[] = [];
  for (let row = 0; row < PLINKO_ROWS; row++) path.push(rng() < 0.5 ? "L" : "R");
  return path;
}

export function plinkoBucketOf(path: readonly PlinkoStep[]): number {
  return path.reduce((sum, step) => sum + (step === "R" ? 1 : 0), 0);
}

export function plinkoEntry(bucket: number): PaytableEntry {
  const entry = plinkoPaytable.entries[bucket];
  if (!entry) throw new Error(`Plinko: Fach ${bucket} liegt außerhalb von 0 … ${PLINKO_BUCKET_COUNT - 1}`);
  return entry;
}

/**
 * Anti-Near-Miss (Regel 7): Hervorgehoben wird ausschließlich das getroffene Fach — nie ein
 * Nachbarfach, nie „fast das 24er-Fach“. Die Funktion ist bewusst so schmal, dass die Oberfläche
 * gar keine Nachbarschaft anzeigen kann, und sie ist testbar.
 */
export function plinkoHighlight(bucket: number): number[] {
  return [bucket];
}

export function resolvePlinkoRound(stakeMinor: number, seed: number): PlinkoRound {
  const path = plinkoPath(seed);
  const bucket = plinkoBucketOf(path);
  const entry = plinkoEntry(bucket);
  const multiplier = plinkoMultiplier(bucket);
  return { path, bucket, multiplier, entry, returnMinor: Math.max(0, Math.round(stakeMinor * multiplier)) };
}

export function resolvePlinko(stakeMinor: number, seed: number): EngineOutcome {
  const round = resolvePlinkoRound(stakeMinor, seed);
  return {
    outcomeKey: round.entry.key,
    outcomeLabel: `${round.entry.label} · ${round.multiplier}×`,
    returnMinor: round.returnMinor,
    detail: { path: round.path.join(""), bucket: round.bucket, multiplier: round.multiplier },
  };
}

/** Liest den in EngineOutcome.detail transportierten Weg zurück (JSON-serialisierbar gehalten). */
export function parsePlinkoDetail(detail: Record<string, unknown> | undefined): { path: PlinkoStep[]; bucket: number } | null {
  if (!detail) return null;
  const raw = detail.path;
  const bucket = detail.bucket;
  if (typeof raw !== "string" || typeof bucket !== "number") return null;
  const path = [...raw].filter((c): c is PlinkoStep => c === "L" || c === "R");
  if (path.length !== PLINKO_ROWS) return null;
  return { path, bucket };
}
