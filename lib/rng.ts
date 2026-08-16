import type { Paytable, PaytableEntry } from "@/types/game-round";

/**
 * Dokumentierte Zufallslogik (Regel 9):
 *  - mulberry32 als gesäter PRNG, damit jede Runde über ihren Seed reproduzierbar ist
 *  - Math.random() ausschließlich in createSeed() für den Startseed
 *  - kein Zustand zwischen Runden, keine „Verlustserie erhöht Gewinnchance“-Mechanik
 */

export type Rng = () => number;

/** mulberry32: kleiner, schneller 32-Bit-PRNG. Liefert Werte in [0, 1). */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Einzige Stelle, an der Math.random() für Spiellogik erlaubt ist: der Startseed. */
export function createSeed(): number {
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0] ?? 0;
  }
  return Math.floor(Math.random() * 0xffffffff) >>> 0;
}

/** Erwartungswert der Tabelle = ausgewiesener Demo-RTP (Regel 6). */
export function expectedValue(paytable: Paytable): number {
  return paytable.entries.reduce((sum, e) => sum + e.multiplier * e.probability, 0);
}

export function totalProbability(paytable: Paytable): number {
  return paytable.entries.reduce((sum, e) => sum + e.probability, 0);
}

/**
 * Wählt eine Ergebnisklasse anhand eines Zufallswerts u ∈ [0,1).
 * Die Klassen werden in Tabellenreihenfolge kumuliert; Rundungsreste fallen auf die letzte Klasse.
 */
export function pickOutcome(paytable: Paytable, u: number): PaytableEntry {
  let acc = 0;
  for (const entry of paytable.entries) {
    acc += entry.probability;
    if (u < acc) return entry;
  }
  const last = paytable.entries[paytable.entries.length - 1];
  if (!last) throw new Error(`Auszahlungstabelle ${paytable.gameId} ist leer`);
  return last;
}

/**
 * Berechnet eine komplette Runde aus Seed und Einsatz. Reine Funktion:
 * gleicher Seed, gleiche Tabelle, gleicher Einsatz → gleiches Ergebnis.
 * Die Rückgabe wird ganzzahlig gerundet (Hundertstel), nie als Float weitergereicht.
 */
export function resolveRound(
  paytable: Paytable,
  stakeMinor: number,
  seed: number,
): { entry: PaytableEntry; returnMinor: number; netMinor: number } {
  const rng = mulberry32(seed);
  const entry = pickOutcome(paytable, rng());
  const returnMinor = Math.round(stakeMinor * entry.multiplier);
  return { entry, returnMinor, netMinor: returnMinor - stakeMinor };
}
