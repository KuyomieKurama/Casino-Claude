import { mulberry32 } from "@/lib/rng";

/**
 * Roulette-Fachlogik — rein, ohne React, vollständig testbar (ENGINE-BRIEF §Architektur).
 *
 * Zufall (Regel 9): eine Runde ist genau ein Wurf. `spin(seed, variant)` zieht mit mulberry32
 * ein Fach aus der Kesselordnung — gleicher Seed ⇒ gleiches Fach, kein Zustand zwischen Runden.
 *
 * Geld (Regel 4): `resolveBet` rechnet in ganzzahligen Hundertsteln. „35:1“ bedeutet
 * Rückgabe = Einsatz × 36 (Gewinn 35 plus Einsatz zurück) — geprüft in roulette-logic.test.ts.
 */

export type RouletteVariant = "european" | "american";

/** Ein Fach im Kessel: 0–36, in der amerikanischen Variante zusätzlich die Doppelnull. */
export type Pocket = number | "00";

/**
 * Tatsächliche Reihenfolge der Fächer im europäischen Kessel (im Uhrzeigersinn ab Null).
 * Das ist die physische Kesselordnung, nicht die Zählreihenfolge 0–36.
 */
export const EUROPEAN_WHEEL: readonly Pocket[] = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5,
  24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
];

/**
 * Tatsächliche Reihenfolge im amerikanischen Kessel (im Uhrzeigersinn ab Null).
 * Null und Doppelnull liegen einander gegenüber.
 */
export const AMERICAN_WHEEL: readonly Pocket[] = [
  0, 28, 9, 26, 30, 11, 7, 20, 32, 17, 5, 22, 34, 15, 3, 24, 36, 13, 1, "00",
  27, 10, 25, 29, 12, 8, 19, 31, 18, 6, 21, 33, 16, 4, 23, 35, 14, 2,
];

/** Die 18 roten Zahlen des Tableaus; die übrigen 18 Zahlen 1–36 sind schwarz. */
export const RED_NUMBERS: ReadonlySet<number> = new Set([
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
]);

export type PocketColor = "red" | "black" | "green";

export function pocketColor(pocket: Pocket): PocketColor {
  if (pocket === "00" || pocket === 0) return "green";
  return RED_NUMBERS.has(pocket) ? "red" : "black";
}

/** Deutsche Textlabels — Farbe wird nie allein über die Darstellung transportiert (§12). */
export const COLOR_LABEL: Record<PocketColor, string> = {
  red: "Rot",
  black: "Schwarz",
  green: "Grün",
};

export function wheelFor(variant: RouletteVariant): readonly Pocket[] {
  return variant === "american" ? AMERICAN_WHEEL : EUROPEAN_WHEEL;
}

/** 37 Fächer (eine Null) bzw. 38 Fächer (Null und Doppelnull). */
export function pocketCount(variant: RouletteVariant): number {
  return wheelFor(variant).length;
}

export function formatPocket(pocket: Pocket): string {
  return pocket === "00" ? "00" : String(pocket);
}

/**
 * Ein Wurf: zieht deterministisch ein Fach aus der Kesselordnung.
 * Gleicher Seed + gleiche Variante ⇒ identisches Ergebnis (Regel 9).
 */
export function spin(seed: number, variant: RouletteVariant): { pocket: Pocket; wheelIndex: number } {
  const wheel = wheelFor(variant);
  const rng = mulberry32(seed);
  const wheelIndex = Math.floor(rng() * wheel.length);
  const pocket = wheel[wheelIndex];
  if (pocket === undefined) throw new Error(`Roulette: ungültiger Kesselindex ${wheelIndex}.`);
  return { pocket, wheelIndex };
}

// ─── Wettarten ────────────────────────────────────────────────────────────────

export type BetKind =
  | "straight" // Plein — eine Zahl
  | "split" // Cheval — zwei benachbarte Zahlen
  | "street" // Transversale — Dreierreihe
  | "corner" // Carré — Viererfeld
  | "sixline" // Sixain — zwei benachbarte Reihen
  | "column" // Kolonne
  | "dozen" // Dutzend
  | "red"
  | "black"
  | "even"
  | "odd"
  | "low" // Manque 1–18
  | "high" // Passe 19–36
  | "five"; // Five Number 0·00·1·2·3 — nur amerikanisch

export type RouletteBet =
  | { kind: "straight"; pocket: Pocket }
  | { kind: "split"; a: Pocket; b: Pocket }
  | { kind: "street"; row: number } // 1–12: Reihe r deckt 3r−2, 3r−1, 3r
  | { kind: "corner"; anchor: number } // linke obere Zahl des Viererfelds
  | { kind: "sixline"; row: number } // 1–11: Reihen r und r+1
  | { kind: "column"; column: 1 | 2 | 3 }
  | { kind: "dozen"; dozen: 1 | 2 | 3 }
  | { kind: "red" }
  | { kind: "black" }
  | { kind: "even" }
  | { kind: "odd" }
  | { kind: "low" }
  | { kind: "high" }
  | { kind: "five" };

/**
 * Auszahlung „x:1“ je Wettart. Rückgabe bei Treffer = Einsatz × (x + 1),
 * weil der Einsatz zusätzlich zum Gewinn zurückgeht.
 */
export const PAYOUT_TO_ONE: Record<BetKind, number> = {
  straight: 35,
  split: 17,
  street: 11,
  corner: 8,
  sixline: 5,
  column: 2,
  dozen: 2,
  red: 1,
  black: 1,
  even: 1,
  odd: 1,
  low: 1,
  high: 1,
  five: 6,
};

/** Anzahl der von einer Wettart abgedeckten Fächer — unabhängig von den konkret gewählten Zahlen. */
export const COVERED_COUNT: Record<BetKind, number> = {
  straight: 1,
  split: 2,
  street: 3,
  corner: 4,
  sixline: 6,
  column: 12,
  dozen: 12,
  red: 18,
  black: 18,
  even: 18,
  odd: 18,
  low: 18,
  high: 18,
  five: 5,
};

/** Wettarten der Variante; die Five-Number-Wette existiert nur am amerikanischen Kessel. */
export function betKindsFor(variant: RouletteVariant): readonly BetKind[] {
  const base: BetKind[] = [
    "straight", "split", "street", "corner", "sixline",
    "column", "dozen", "red", "black", "even", "odd", "low", "high",
  ];
  return variant === "american" ? [...base, "five"] : base;
}

/**
 * Rechnerische Rückgabequote einer Wettart: abgedeckte Fächer × Rückgabefaktor / Fächerzahl.
 * Europäisch gilt für jede Standardwette k·(x+1) = 36 ⇒ 36/37 ≈ 97,297 %.
 * Amerikanisch 36/38 ≈ 94,737 %; Five Number 5·7/38 = 35/38 ≈ 92,105 %.
 */
export function betRtp(kind: BetKind, variant: RouletteVariant): number {
  return (COVERED_COUNT[kind] * (PAYOUT_TO_ONE[kind] + 1)) / pocketCount(variant);
}

/** Alle von einer Wette abgedeckten Fächer. */
export function coveredPockets(bet: RouletteBet): readonly Pocket[] {
  switch (bet.kind) {
    case "straight":
      return [bet.pocket];
    case "split":
      return [bet.a, bet.b];
    case "street":
      return [bet.row * 3 - 2, bet.row * 3 - 1, bet.row * 3];
    case "corner":
      return [bet.anchor, bet.anchor + 1, bet.anchor + 3, bet.anchor + 4];
    case "sixline":
      return [0, 1, 2, 3, 4, 5].map((i) => bet.row * 3 - 2 + i);
    case "column":
      return Array.from({ length: 12 }, (_, i) => bet.column + i * 3);
    case "dozen":
      return Array.from({ length: 12 }, (_, i) => (bet.dozen - 1) * 12 + i + 1);
    case "red":
      return [...RED_NUMBERS];
    case "black":
      return numbers1to36().filter((n) => !RED_NUMBERS.has(n));
    case "even":
      // Die Null zählt bei Gerade/Ungerade nicht mit — sie ist weder gerade noch ungerade gesetzt.
      return numbers1to36().filter((n) => n % 2 === 0);
    case "odd":
      return numbers1to36().filter((n) => n % 2 === 1);
    case "low":
      return numbers1to36().filter((n) => n <= 18);
    case "high":
      return numbers1to36().filter((n) => n >= 19);
    case "five":
      return [0, "00", 1, 2, 3];
  }
}

/**
 * Rückgabe einer aufgelösten Wette in ganzzahligen Hundertsteln:
 * Treffer ⇒ Einsatz × (Auszahlung + 1), sonst 0. Nie negativ, nie gebrochen.
 */
export function resolveBet(bet: RouletteBet, pocket: Pocket, stakeMinor: number): number {
  const hit = coveredPockets(bet).some((p) => p === pocket);
  return hit ? stakeMinor * (PAYOUT_TO_ONE[bet.kind] + 1) : 0;
}

// ─── Hilfen für die Wettauswahl der Oberfläche ───────────────────────────────

/** Gültige Cheval-Partner einer Zahl auf dem Tableau (inklusive der Zero-Anschlüsse). */
export function splitPartners(pocket: Pocket, variant: RouletteVariant): readonly Pocket[] {
  if (pocket === 0) return variant === "american" ? ["00", 1, 2] : [1, 2, 3];
  if (pocket === "00") return [0, 2, 3];
  const partners: Pocket[] = [];
  // Anschlüsse an Null/Doppelnull: europäisch liegt 0 über 1–3, amerikanisch 0 über 1–2 und 00 über 2–3.
  if (variant === "european") {
    if (pocket <= 3) partners.push(0);
  } else {
    if (pocket === 1) partners.push(0);
    if (pocket === 2) partners.push(0, "00");
    if (pocket === 3) partners.push("00");
  }
  const col = (pocket - 1) % 3;
  if (pocket - 3 >= 1) partners.push(pocket - 3);
  if (col > 0) partners.push(pocket - 1);
  if (col < 2) partners.push(pocket + 1);
  if (pocket + 3 <= 36) partners.push(pocket + 3);
  return partners;
}

export function isValidSplit(a: Pocket, b: Pocket, variant: RouletteVariant): boolean {
  return splitPartners(a, variant).some((p) => p === b);
}

/** Linke obere Zahlen aller Carré-Felder: Reihen 1–11, Spalten 1–2. */
export function cornerAnchors(): readonly number[] {
  const anchors: number[] = [];
  for (let row = 0; row < 11; row++) {
    anchors.push(row * 3 + 1, row * 3 + 2);
  }
  return anchors;
}

function numbers1to36(): number[] {
  return Array.from({ length: 36 }, (_, i) => i + 1);
}
