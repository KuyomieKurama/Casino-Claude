import type { Paytable } from "@/types/game-round";
import { buildPaytable } from "@/lib/paytable";

/**
 * Auszahlungstabellen der Roulette-Varianten — eine Tabelle je Wettart (Schlüssel `gameId::betId`).
 * Der Erwartungswert jeder Tabelle IST der für diese Wette ausgewiesene RTP (Regel 6).
 *
 * Rechnung (Rückgabe, nicht Gewinn: „x:1“ ⇒ Rückgabe = Einsatz × (x + 1)):
 *
 *   EV = abgedeckte Fächer k × (x + 1) / Fächerzahl n
 *
 * Für jede Standardwette gilt k × (x + 1) = 36:
 *   Plein        k = 1,  35:1 ⇒ 1 × 36 = 36
 *   Cheval       k = 2,  17:1 ⇒ 2 × 18 = 36
 *   Transversale k = 3,  11:1 ⇒ 3 × 12 = 36
 *   Carré        k = 4,   8:1 ⇒ 4 ×  9 = 36
 *   Sixain       k = 6,   5:1 ⇒ 6 ×  6 = 36
 *   Kolonne      k = 12,  2:1 ⇒ 12 × 3 = 36
 *   Dutzend      k = 12,  2:1 ⇒ 12 × 3 = 36
 *   Rot/Schwarz, Gerade/Ungerade, Manque/Passe: k = 18, 1:1 ⇒ 18 × 2 = 36
 *
 * Daraus:
 *   europäisch (n = 37): EV = 36/37 = 0,972972… ≈ 97,297 % — für ALLE Standardwetten gleich
 *   amerikanisch (n = 38): EV = 36/38 = 0,947368… ≈ 94,737 %
 *   Five Number (nur amerikanisch): k = 5, 6:1 ⇒ Rückgabe 7 × Einsatz
 *     EV = 5 × 7 / 38 = 35/38 = 0,921052… ≈ 92,105 %
 *   Die Five-Number-Wette hat damit als einzige Wette am amerikanischen Kessel einen
 *   niedrigeren Erwartungswert als alle übrigen (35/38 statt 36/38). Sachliche Angabe,
 *   keine Empfehlung — die Oberfläche weist sie an der Wettauswahl aus.
 *
 * Live Roulette Demo nutzt dieselbe Fachlogik wie European Roulette und deshalb dieselben Werte,
 * aber eigene Tabellen unter eigener Spiel-ID.
 */

type BetSpec = {
  betId: string;
  /** Klartextname für die Detailseite. */
  label: string;
  /** Abgedeckte Fächer. */
  wins: number;
  /** Auszahlung „x:1“. */
  payoutToOne: number;
  /** true, wenn die Wette nur am amerikanischen Kessel existiert. */
  americanOnly?: boolean;
};

const BET_SPECS: readonly BetSpec[] = [
  { betId: "straight", label: "Plein (eine Zahl)", wins: 1, payoutToOne: 35 },
  { betId: "split", label: "Cheval (zwei Zahlen)", wins: 2, payoutToOne: 17 },
  { betId: "street", label: "Transversale (Dreierreihe)", wins: 3, payoutToOne: 11 },
  { betId: "corner", label: "Carré (vier Zahlen)", wins: 4, payoutToOne: 8 },
  { betId: "sixline", label: "Sixain (sechs Zahlen)", wins: 6, payoutToOne: 5 },
  { betId: "column", label: "Kolonne (zwölf Zahlen)", wins: 12, payoutToOne: 2 },
  { betId: "dozen", label: "Dutzend (zwölf Zahlen)", wins: 12, payoutToOne: 2 },
  { betId: "red", label: "Rot", wins: 18, payoutToOne: 1 },
  { betId: "black", label: "Schwarz", wins: 18, payoutToOne: 1 },
  { betId: "even", label: "Gerade", wins: 18, payoutToOne: 1 },
  { betId: "odd", label: "Ungerade", wins: 18, payoutToOne: 1 },
  { betId: "low", label: "Manque (1–18)", wins: 18, payoutToOne: 1 },
  { betId: "high", label: "Passe (19–36)", wins: 18, payoutToOne: 1 },
  { betId: "five", label: "Five Number (0, 00, 1, 2, 3)", wins: 5, payoutToOne: 6, americanOnly: true },
];

/**
 * Baut alle Tabellen eines Kessels: `wins` von `pockets` Fächern zahlen (x + 1)×, der Rest ist
 * eine Nullrunde. `buildPaytable` prüft dabei, dass die Wahrscheinlichkeiten exakt auf 1 summieren —
 * ein Datenfehler fällt damit schon beim Laden des Moduls auf und nicht erst im Test.
 */
function tablesFor(gameId: string, pockets: 37 | 38): Paytable[] {
  return BET_SPECS.filter((b) => (b.americanOnly ? pockets === 38 : true)).map((b) => ({
    ...buildPaytable(`${gameId}::${b.betId}`, [
      {
        key: "win",
        label: `Treffer (${b.payoutToOne}:1, Rückgabe ${b.payoutToOne + 1}× Einsatz)`,
        multiplier: b.payoutToOne + 1, // Rückgabe = Gewinn (x) + Einsatz zurück (1)
        probability: b.wins / pockets,
      },
      { key: "none", label: "Kein Treffer", multiplier: 0, probability: 1 - b.wins / pockets },
    ]),
    label: b.label,
  }));
}

export const roulettePaytables: readonly Paytable[] = [
  ...tablesFor("g-european-roulette", 37),
  ...tablesFor("g-american-roulette", 38),
  // Live-Tisch: gleiche Fachlogik wie European Roulette, eigene Spiel-ID
  ...tablesFor("g-live-roulette-demo", 37),
];
