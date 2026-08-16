import type { EngineOutcome } from "@/types/engine";
import { mulberry32 } from "@/lib/rng";

/**
 * Mines Demo — Fachlogik, rein und ohne React.
 *
 * Raster 5 × 5 = 25 Felder, wahlweise 1, 3 oder 5 Minen. Jedes aufgedeckte freie Feld erhöht den
 * Multiplikator; ein Treffer beendet die Runde mit Rückgabe 0. Die spielende Person kann jederzeit
 * auszahlen und den aktuellen Multiplikator sichern.
 *
 * Warum es hier KEINE Auszahlungstabelle in data/paytables gibt (Regel 6): Der Erwartungswert
 * einer Runde hängt davon ab, wann jemand aufhört. Es gibt also keinen einzelnen RTP-Wert, den
 * man ausweisen dürfte. Ausgewiesen wird stattdessen der Hausvorteil je Stufe: multiplier(k) =
 * 0,97 / P(k) — jede einzelne Entscheidung „noch ein Feld“ ist mit 3 % Hausvorteil bewertet.
 *
 * Minenpositionen: deterministisch aus dem Rundenseed, VOR dem ersten Klick festgelegt. Sie
 * werden nie nachträglich verschoben; die Oberfläche bekommt sie beim Rundenstart und ändert sie
 * nicht mehr. Ein Test hält das fest.
 */

export const MINES_GRID_SIZE = 5;
export const MINES_CELLS = MINES_GRID_SIZE * MINES_GRID_SIZE;
export const MINES_COUNTS = [1, 3, 5] as const;
export type MinesCount = (typeof MINES_COUNTS)[number];
export const MINES_DEFAULT_COUNT: MinesCount = 3;
/** Hausvorteil 3 % — derselbe Wert wie bei Dice Demo. */
export const MINES_HOUSE_EDGE_FACTOR = 0.97;

export function isMinesCount(value: number): value is MinesCount {
  return (MINES_COUNTS as readonly number[]).includes(value);
}

/** Wettschlüssel je Minenzahl, damit useRound die Variante an resolve() durchreichen kann. */
export function minesBetId(mines: MinesCount): string {
  return `m${mines}`;
}

export function minesCountFromBetId(betId: string | undefined): MinesCount {
  const parsed = Number(betId?.replace(/^m/, ""));
  return isMinesCount(parsed) ? parsed : MINES_DEFAULT_COUNT;
}

/**
 * Wahrscheinlichkeit, k Felder in Folge sicher aufzudecken (hypergeometrisch, ohne Zurücklegen):
 *   P(k) = Π_{i=0}^{k-1} (25 − m − i) / (25 − i)
 * Beispiel m = 3: P(1) = 22/25 = 0,88 · P(2) = 22·21/(25·24) = 0,77 · P(22) = 1/C(25,3) = 1/2300.
 */
export function minesSafeProbability(mines: MinesCount, revealed: number): number {
  let p = 1;
  for (let i = 0; i < revealed; i++) p *= (MINES_CELLS - mines - i) / (MINES_CELLS - i);
  return p;
}

/**
 * Multiplikator nach k sicher aufgedeckten Feldern: 0,97 / P(k), auf zwei Nachkommastellen.
 * Fair (ohne Hausvorteil) wäre 1 / P(k); der Faktor 0,97 setzt die 3 % an.
 * k = 0 liefert 0: vor dem ersten Aufdecken gibt es nichts zu sichern, und 0,97 × Einsatz
 * auszuzahlen wäre eine Rückgabe unter Einsatz, die als „Auszahlung“ nur irreführend wäre.
 */
export function minesMultiplier(mines: MinesCount, revealed: number): number {
  if (revealed <= 0) return 0;
  const safeCells = MINES_CELLS - mines;
  const k = Math.min(revealed, safeCells);
  return Math.round((MINES_HOUSE_EDGE_FACTOR / minesSafeProbability(mines, k)) * 100) / 100;
}

/** Die vollständige Staffel für die Anzeige: Index 0 entspricht k = 1. */
export function minesLadder(mines: MinesCount): number[] {
  const safeCells = MINES_CELLS - mines;
  return Array.from({ length: safeCells }, (_, i) => minesMultiplier(mines, i + 1));
}

/** Rückgabe beim Auszahlen nach k aufgedeckten Feldern — ganzzahlige Hundertstel, nie negativ. */
export function minesReturnMinor(stakeMinor: number, mines: MinesCount, revealed: number): number {
  return Math.max(0, Math.round(stakeMinor * minesMultiplier(mines, revealed)));
}

/**
 * Obergrenze der Rückgabe (maxReturnMinor im EngineOutcome): alle sicheren Felder aufgedeckt,
 * also k = 25 − m. Weil die Staffel monoton steigt, kann keine Auszahlung darüber liegen —
 * geprüft über viele simulierte Runden.
 */
export function minesMaxReturnMinor(stakeMinor: number, mines: MinesCount): number {
  return minesReturnMinor(stakeMinor, mines, MINES_CELLS - mines);
}

/**
 * Minenpositionen aus dem Rundenseed: teilweiser Fisher-Yates-Durchlauf über 0 … 24.
 * Gleicher Seed und gleiche Minenzahl ⇒ gleiche Positionen.
 */
export function minePositions(seed: number, mines: MinesCount): number[] {
  const rng = mulberry32(seed);
  const cells = Array.from({ length: MINES_CELLS }, (_, i) => i);
  for (let i = 0; i < mines; i++) {
    const j = i + Math.floor(rng() * (MINES_CELLS - i));
    const a = cells[i] ?? i;
    const b = cells[j] ?? j;
    cells[i] = b;
    cells[j] = a;
  }
  return cells.slice(0, mines).sort((x, y) => x - y);
}

/**
 * Rundenstart. Die Rückgabe ist zunächst 0 — das Ergebnis entsteht erst durch die Entscheidungen
 * der spielenden Person. Deklariert wird die Obergrenze, mehr kann der Wallet-Reducer nicht
 * gutschreiben (siehe useRound.test.tsx, „Ergebnis über der Obergrenze wird abgelehnt“).
 */
export function startMinesRound(stakeMinor: number, seed: number, betId: string | undefined): EngineOutcome {
  const mines = minesCountFromBetId(betId);
  const positions = minePositions(seed, mines);
  return {
    outcomeKey: "open",
    outcomeLabel: "Runde läuft",
    returnMinor: 0,
    maxReturnMinor: minesMaxReturnMinor(stakeMinor, mines),
    detail: { mines, positions },
  };
}

export function parseMinesDetail(detail: Record<string, unknown> | undefined): { mines: MinesCount; positions: number[] } | null {
  if (!detail) return null;
  const { mines, positions } = detail;
  if (typeof mines !== "number" || !isMinesCount(mines)) return null;
  if (!Array.isArray(positions) || positions.some((p) => typeof p !== "number")) return null;
  return { mines, positions: positions as number[] };
}
