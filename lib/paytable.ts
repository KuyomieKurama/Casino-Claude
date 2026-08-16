import type { Paytable, PaytableEntry } from "@/types/game-round";
import { expectedValue, totalProbability } from "./rng";

/**
 * Hilfen zum Bauen dokumentierter Auszahlungstabellen (Regel 6).
 *
 * `buildPaytable` normalisiert nichts und rundet nichts weg — die Wahrscheinlichkeiten müssen
 * exakt auf 1 summieren. Das ist Absicht: eine Tabelle, deren Summe nicht stimmt, ist ein
 * Datenfehler und soll früh auffallen, nicht stillschweigend korrigiert werden.
 */
export function buildPaytable(gameId: string, entries: readonly PaytableEntry[]): Paytable {
  const table = { gameId, entries: [...entries] };
  const sum = totalProbability(table);
  if (Math.abs(sum - 1) > 1e-9) {
    throw new Error(`Auszahlungstabelle ${gameId}: Wahrscheinlichkeiten summieren auf ${sum}, erwartet 1.`);
  }
  for (const e of table.entries) {
    if (e.probability < 0 || e.multiplier < 0) throw new Error(`Auszahlungstabelle ${gameId}: negativer Wert in „${e.key}“.`);
  }
  return table;
}

/**
 * Erzeugt aus n gleich wahrscheinlichen Fällen (Roulette-Kessel, Würfel …) eine Tabelle:
 * `wins` Treffer mit `multiplier`, der Rest ist eine Nullrunde.
 */
export function uniformPaytable(gameId: string, opts: { total: number; wins: number; multiplier: number; winLabel: string; loseLabel?: string; winKey?: string }): Paytable {
  const p = opts.wins / opts.total;
  return buildPaytable(gameId, [
    { key: opts.winKey ?? "win", label: opts.winLabel, multiplier: opts.multiplier, probability: p },
    { key: "none", label: opts.loseLabel ?? "Kein Treffer", multiplier: 0, probability: 1 - p },
  ]);
}

/** Der Erwartungswert einer Tabelle, gerundet auf vier Nachkommastellen — so wird rtpDemo gesetzt. */
export function rtpOf(table: Paytable): number {
  return Math.round(expectedValue(table) * 10_000) / 10_000;
}
