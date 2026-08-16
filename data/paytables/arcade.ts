import type { Paytable, PaytableEntry } from "@/types/game-round";

/**
 * Arcade und Game Shows — Plinko Demo, Dice Demo, Wheel Demo.
 *
 * Diese Datei ist die einzige Quelle der Zahlen: Fächer, Segmente und Wettstufen stehen hier,
 * die Engines (components/game/engine/arcade/) rechnen ausschließlich mit diesen Werten.
 * `data/` importiert per Schichtregel nur aus `types/` — deshalb werden die Tabellen hier ohne
 * `lib/paytable` gebaut; dass jede Tabelle exakt auf 1 summiert, prüft arcade-logic.test.ts.
 *
 * Mines Demo hat bewusst KEINE Tabelle: der Erwartungswert einer Runde hängt davon ab, wann die
 * spielende Person aufhört. Ein einzelner RTP-Wert wäre dort eine Behauptung ohne Grundlage
 * (Regel 6). Die Multiplikator-Staffel steht stattdessen in mines-logic.ts und in der Oberfläche.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Plinko Demo — 12 Reihen, 13 Fächer
// ─────────────────────────────────────────────────────────────────────────────

/** Anzahl der Nagelreihen. Die Kugel trifft pro Reihe genau eine Links-/Rechts-Entscheidung. */
export const PLINKO_ROWS = 12;
export const PLINKO_BUCKET_COUNT = PLINKO_ROWS + 1;
/** 2^12 = 4096 mögliche Wege — jeder gleich wahrscheinlich. */
export const PLINKO_TOTAL_PATHS = 2 ** PLINKO_ROWS;

/**
 * Binomialkoeffizienten C(rows, k) über das Pascalsche Dreieck — ausschließlich Ganzzahladdition,
 * daher exakt (C(12,6) = 924 liegt weit unter Number.MAX_SAFE_INTEGER).
 */
export function binomialRow(rows: number): number[] {
  let row: number[] = [1];
  for (let r = 1; r <= rows; r++) {
    const next: number[] = [1];
    for (let k = 1; k < r; k++) next.push((row[k - 1] ?? 0) + (row[k] ?? 0));
    next.push(1);
    row = next;
  }
  return row;
}

/** [1, 12, 66, 220, 495, 792, 924, 792, 495, 220, 66, 12, 1] — Summe 4096. */
export const PLINKO_BINOMIALS: readonly number[] = binomialRow(PLINKO_ROWS);

/**
 * Wahrscheinlichkeit von Fach k = C(12,k) / 4096.
 *
 * Kein Float-Drift: Zähler sind exakte Ganzzahlen, der Nenner ist eine Zweierpotenz. Jede
 * Wahrscheinlichkeit ist damit ein exakt darstellbarer Binärbruch, und weil die Zähler in Summe
 * exakt 4096 ergeben, summiert auch die Gleitkommasumme exakt auf 1,0 — ohne Normalisierung.
 * Der Test prüft das mit strikter Gleichheit (=== 1), nicht mit Toleranz.
 */
export function plinkoBucketProbability(bucket: number): number {
  return (PLINKO_BINOMIALS[bucket] ?? 0) / PLINKO_TOTAL_PATHS;
}

/**
 * Multiplikator nach Abstand von der Mitte (Index 0 = Mittelfach): außen hoch, Mitte niedrig.
 * Bewusst höchstens drei Zeichen je Wert, damit die Fachwerte auch bei 320 px Breite lesbar
 * unter das Brett passen, ohne horizontales Scrollen.
 */
export const PLINKO_MULTIPLIER_BY_DISTANCE: readonly number[] = [0.4, 0.8, 1, 1.5, 3, 9, 24];

export function plinkoMultiplier(bucket: number): number {
  const distance = Math.abs(bucket - PLINKO_ROWS / 2);
  return PLINKO_MULTIPLIER_BY_DISTANCE[distance] ?? 0;
}

/**
 * Erwartungswert, exakt nachgerechnet (Beiträge als Zähler über 4096):
 *   Fach  0/12 · 24    → 2 · 24    =   48
 *   Fach  1/11 ·  9    → 24 ·  9   =  216
 *   Fach  2/10 ·  3    → 132 ·  3  =  396
 *   Fach  3/ 9 ·  1,5  → 440 · 1,5 =  660
 *   Fach  4/ 8 ·  1    → 990 · 1   =  990
 *   Fach  5/ 7 ·  0,8  → 1584· 0,8 = 1267,2
 *   Fach  6    ·  0,4  → 924 · 0,4 =  369,6
 *   Summe = 3946,8 / 4096 = 0,96357421875  ⇒  RTP 96,36 %
 */
export const plinkoPaytable: Paytable = {
  gameId: "g-plinko-demo",
  label: "Fächer des Nagelbretts",
  entries: Array.from({ length: PLINKO_BUCKET_COUNT }, (_, k): PaytableEntry => ({
    key: `b${k}`,
    label: `Fach ${k + 1} von ${PLINKO_BUCKET_COUNT}`,
    multiplier: plinkoMultiplier(k),
    probability: plinkoBucketProbability(k),
  })),
};

// ─────────────────────────────────────────────────────────────────────────────
// Wheel Demo — 16 gleich große Segmente
// ─────────────────────────────────────────────────────────────────────────────

export const WHEEL_SEGMENT_COUNT = 16;

/**
 * Multiplikator je Segment in Radreihenfolge (Segment 1 … 16).
 * Gleiche Werte liegen nicht gehäuft nebeneinander; das ist reine Gestaltung und hat keinen
 * Einfluss auf die Wahrscheinlichkeiten — jedes Segment trifft mit 1/16.
 */
const WHEEL_ORDER: readonly number[] = [0, 0.5, 0, 1, 0, 2, 0, 0.5, 0, 1.5, 0.5, 1, 0, 3, 0.5, 5];

/** Ergebnisklassen: ein Eintrag je Segmentwert, Wahrscheinlichkeit = Segmentzahl / 16. */
const WHEEL_CLASSES: readonly { key: string; multiplier: number; label: string }[] = [
  { key: "w0", multiplier: 0, label: "Leerfeld (0×)" },
  { key: "w05", multiplier: 0.5, label: "Teilrückgabe (0,5×)" },
  { key: "w1", multiplier: 1, label: "Einsatz zurück (1×)" },
  { key: "w15", multiplier: 1.5, label: "Kleiner Treffer (1,5×)" },
  { key: "w2", multiplier: 2, label: "Treffer (2×)" },
  { key: "w3", multiplier: 3, label: "Großer Treffer (3×)" },
  { key: "w5", multiplier: 5, label: "Höchstsegment (5×)" },
];

export type WheelSegment = {
  /** 0-basierter Index in Radreihenfolge. */
  index: number;
  /** Sichtbarer Name — das Ergebnis wird benannt, nicht nur eingefärbt. */
  name: string;
  multiplier: number;
  /** Schlüssel der Ergebnisklasse in der Auszahlungstabelle. */
  key: string;
};

function wheelClassKey(multiplier: number): string {
  return WHEEL_CLASSES.find((c) => c.multiplier === multiplier)?.key ?? "w0";
}

export const WHEEL_SEGMENTS: readonly WheelSegment[] = WHEEL_ORDER.map((multiplier, index) => ({
  index,
  name: `Segment ${index + 1}`,
  multiplier,
  key: wheelClassKey(multiplier),
}));

/**
 * Erwartungswert, exakt nachgerechnet:
 *   6 × 0    = 0
 *   4 × 0,5  = 2,0
 *   2 × 1    = 2,0
 *   1 × 1,5  = 1,5
 *   1 × 2    = 2,0
 *   1 × 3    = 3,0
 *   1 × 5    = 5,0
 *   Summe der Multiplikatoren = 15,5 · (1/16) = 0,96875  ⇒  RTP 96,88 %
 *
 * Warum nicht exakt 96,0 %: bei 16 gleich großen Segmenten und Multiplikatoren in Halbschritten
 * sind nur Vielfache von 0,5/16 = 3,125 Prozentpunkten erreichbar. Die beiden Nachbarwerte sind
 * 93,75 % und 96,875 %; letzterer liegt näher an 96 %. Ein exakter Wert würde krumme
 * Segmentwerte wie „4,86×“ erzwingen, die auf einem Rad niemand liest.
 */
export const wheelPaytable: Paytable = {
  gameId: "g-wheel-demo",
  label: "Segmentwerte des Rads",
  entries: WHEEL_CLASSES.map((c): PaytableEntry => ({
    key: c.key,
    label: c.label,
    multiplier: c.multiplier,
    probability: WHEEL_SEGMENTS.filter((s) => s.multiplier === c.multiplier).length / WHEEL_SEGMENT_COUNT,
  })),
};

// ─────────────────────────────────────────────────────────────────────────────
// Dice Demo — ein Wurf von 1 bis 100
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Gewählter Wertebereich: ganze Zahlen 1 … 100, jede mit Wahrscheinlichkeit 1/100.
 * (Die Alternative 0,00–99,99 wurde verworfen: sie erzwingt für „über“ Zielwerte wie 89,99,
 * damit die Trefferwahrscheinlichkeit glatt bleibt.)
 *
 *  - „Unter t“ trifft, wenn der Wurf echt kleiner als t ist  ⇒ p = (t − 1)/100
 *  - „Über t“  trifft, wenn der Wurf echt größer als t ist   ⇒ p = (100 − t)/100
 */
export const DICE_MIN_ROLL = 1;
export const DICE_MAX_ROLL = 100;

export type DiceDirection = "under" | "over";

export type DiceBet = {
  id: string;
  direction: DiceDirection;
  target: number;
  /** Trefferwahrscheinlichkeit, exakt k/100. */
  winChance: number;
  /** 0,97 / Trefferwahrscheinlichkeit, auf zwei Nachkommastellen — hier ohne Rundungsverlust. */
  multiplier: number;
  label: string;
};

/**
 * Fünf Stufen. Auszahlung = 0,97 / p, auf zwei Nachkommastellen gerundet.
 *
 * Die Stufen sind so gewählt, dass diese Rundung nichts verändert: mit p = k/100 ist
 * 0,97/p = 97/k, und das hat genau dann höchstens zwei Nachkommastellen, wenn k ein Teiler von
 * 9700 = 2² · 5² · 97 ist. Verwendet werden k ∈ {5, 10, 20, 25, 50}:
 *   p = 0,05 → 19,40 ·0,05 = 0,97
 *   p = 0,10 →  9,70 ·0,10 = 0,97
 *   p = 0,20 →  4,85 ·0,20 = 0,97
 *   p = 0,25 →  3,88 ·0,25 = 0,97
 *   p = 0,50 →  1,94 ·0,50 = 0,97
 * Jede Stufe hat damit exakt denselben RTP von 97,00 % — geprüft in arcade-logic.test.ts.
 * (k = 75 oder k = 90 wären nicht rundungsfest: 97/75 = 1,2933… ⇒ 96,75 % statt 97 %.)
 */
const DICE_LEVELS: readonly { chancePercent: number; multiplier: number }[] = [
  { chancePercent: 50, multiplier: 1.94 },
  { chancePercent: 25, multiplier: 3.88 },
  { chancePercent: 20, multiplier: 4.85 },
  { chancePercent: 10, multiplier: 9.7 },
  { chancePercent: 5, multiplier: 19.4 },
];

function diceBet(direction: DiceDirection, level: { chancePercent: number; multiplier: number }): DiceBet {
  // „unter t“: p = (t−1)/100 ⇒ t = Chance + 1 · „über t“: p = (100−t)/100 ⇒ t = 100 − Chance
  const target = direction === "under" ? level.chancePercent + 1 : 100 - level.chancePercent;
  return {
    id: `${direction}-${target}`,
    direction,
    target,
    winChance: level.chancePercent / 100,
    multiplier: level.multiplier,
    label: direction === "under" ? `Unter ${target}` : `Über ${target}`,
  };
}

export const DICE_BETS: readonly DiceBet[] = [
  ...DICE_LEVELS.map((l) => diceBet("under", l)),
  ...DICE_LEVELS.map((l) => diceBet("over", l)),
];

export function findDiceBet(betId: string | undefined): DiceBet | undefined {
  return DICE_BETS.find((b) => b.id === betId);
}

/** Voreinstellung ohne Vorteilsversprechen: die mittlere Stufe „Über 50“. */
export const DICE_DEFAULT_BET_ID = "over-50";

export const dicePaytables: readonly Paytable[] = DICE_BETS.map((bet): Paytable => ({
  gameId: `g-dice-demo::${bet.id}`,
  label: bet.label,
  entries: [
    {
      key: "win",
      label: `Treffer — Wurf ${bet.direction === "under" ? "kleiner als" : "größer als"} ${bet.target}`,
      multiplier: bet.multiplier,
      probability: bet.winChance,
    },
    { key: "none", label: "Kein Treffer", multiplier: 0, probability: 1 - bet.winChance },
  ],
}));

// ─────────────────────────────────────────────────────────────────────────────

/** Alle Tabellen der Arcade- und Game-Show-Engines. Mines Demo steht bewusst nicht hier. */
export const arcadePaytables: readonly Paytable[] = [plinkoPaytable, wheelPaytable, ...dicePaytables];
