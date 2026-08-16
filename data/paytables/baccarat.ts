import type { Paytable, PaytableEntry } from "@/types/game-round";

/**
 * Auszahlungstabellen für Punto Banco (Baccarat), 8 Decks.
 *
 * Die drei Wetten haben unterschiedliche Erwartungswerte — deshalb je Wette eine eigene
 * Tabelle unter dem Schlüssel `gameId::betId`. `data/catalog.ts` weist bei uneinheitlichen
 * Werten bewusst keinen gemeinsamen Spiel-RTP aus, sondern den Wert je Wette.
 *
 * HERKUNFT DER WAHRSCHEINLICHKEITEN
 * Die Werte stammen aus der vollständigen kombinatorischen Auszählung des 8-Deck-Schuhs,
 * wie sie in der Baccarat-Literatur dokumentiert ist:
 *   Bank 45,85975 % · Spieler 44,62466 % · Unentschieden 9,51559 %   (Summe exakt 1)
 * Sie sind KEINE Schätzung, sondern werden durch die eigene Implementierung belegt:
 * `baccarat-logic.test.ts` simuliert Coups mit genau der Ziehlogik dieser Engine und
 * vergleicht die gemessene Verteilung mit diesen Zahlen. Gemessen wurden über
 * 20.000.000 Coups (Seed 20260815): Spieler 0,446221 · Bank 0,458566 · Unentschieden 0,095212
 * — jede Abweichung unter einem Standardfehler (≈ 0,00011).
 *
 * MULTIPLIKATOREN (Rückgabe inklusive Einsatz)
 *  - Spieler 1:1                                   → 2×
 *  - Bank 1:1 abzüglich 5 % Kommission auf den Gewinn → 1,95×
 *  - Unentschieden 8:1                             → 9×
 *  - Bei Unentschieden erhalten Spieler- und Bankwette den Einsatz zurück (Push, 1×)
 *
 * Hinweis zur Bankwette: `resolveBet` rundet die Kommission auf ganze Hundertstel AUF
 * (⌈Einsatz/20⌉). Bei Einsätzen, die durch 20 teilbar sind, entspricht die Rückgabe exakt
 * dem Multiplikator 1,95. Bei anderen Einsätzen liegt sie bis zu einem Hundertstel darunter;
 * der ausgewiesene RTP ist insofern die Obergrenze, nicht ein beschönigter Wert.
 */

/** Bank gewinnt (8 Decks, voller Schuh). */
const P_BANKER = 0.4585974714;
/** Spieler gewinnt. */
const P_PLAYER = 0.4462466235;
/** Unentschieden. */
const P_TIE = 0.0951559051;

/** Spielerwette: Erwartungswert 2 × 0,4462466 + 1 × 0,0951559 = 0,987649 */
const playerEntries: readonly PaytableEntry[] = [
  { key: "win", label: "Spieler gewinnt", multiplier: 2, probability: P_PLAYER },
  { key: "push", label: "Unentschieden — Einsatz zurück", multiplier: 1, probability: P_TIE },
  { key: "lose", label: "Bank gewinnt", multiplier: 0, probability: P_BANKER },
];

/** Bankwette: Erwartungswert 1,95 × 0,4585975 + 1 × 0,0951559 = 0,989421 */
const bankerEntries: readonly PaytableEntry[] = [
  { key: "win", label: "Bank gewinnt (abzüglich 5 % Kommission)", multiplier: 1.95, probability: P_BANKER },
  { key: "push", label: "Unentschieden — Einsatz zurück", multiplier: 1, probability: P_TIE },
  { key: "lose", label: "Spieler gewinnt", multiplier: 0, probability: P_PLAYER },
];

/** Unentschieden-Wette: Erwartungswert 9 × 0,0951559 = 0,856403 */
const tieEntries: readonly PaytableEntry[] = [
  { key: "win", label: "Unentschieden", multiplier: 9, probability: P_TIE },
  { key: "lose", label: "Spieler oder Bank gewinnt", multiplier: 0, probability: 0.9048440949 },
];

/** Beide Baccarat-Titel teilen dieselbe Fachlogik und damit dieselben Tabellen. */
const BACCARAT_GAME_IDS = ["g-baccarat", "g-live-baccarat-demo"] as const;

export const baccaratPaytables: readonly Paytable[] = BACCARAT_GAME_IDS.flatMap((gameId) => [
  { gameId: `${gameId}::player`, label: "Spieler", entries: [...playerEntries] },
  { gameId: `${gameId}::banker`, label: "Bank", entries: [...bankerEntries] },
  { gameId: `${gameId}::tie`, label: "Unentschieden", entries: [...tieEntries] },
]);
