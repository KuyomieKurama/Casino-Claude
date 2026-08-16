import { mulberry32 } from "@/lib/rng";
import type { EngineOutcome, EngineResolveInput } from "@/types/engine";

/**
 * Video Poker „Jacks or Better“ — reine Fachlogik ohne React.
 *
 * Ablauf: fünf Karten aus einem gemischten 52-Karten-Deck, EIN Tausch beliebig vieler Karten,
 * danach feste Gewinntabelle. Die getauschten Karten kommen aus demselben Deck, also nie doppelt.
 *
 * GEWINNTABELLE (9/6 — Full House 9, Flush 6), Multiplikator auf den Einsatz:
 *   Royal Flush 250 · Straight Flush 50 · Vierling 25 · Full House 9 · Flush 6 ·
 *   Straße 4 · Drilling 3 · Zwei Paare 2 · Paar Buben oder besser 1 · sonst 0
 *
 * Warum 250 und nicht 800 beim Royal Flush: Der Bonus von 800 gilt im Original nur bei fünf
 * eingesetzten Münzen (also fünffachem Einsatz) und ist auf diesen Einsatz bezogen effektiv 160.
 * Dieser Prototyp kennt genau einen Einsatzbetrag pro Runde und keine Münzstufen; deshalb wird
 * durchgehend die Ein-Münzen-Spalte verwendet, in der der Royal Flush 250 zahlt. Ein Wert von
 * 800 bei einfachem Einsatz wäre eine bessere Auszahlung, als das Vorbild sie kennt.
 *
 * KEIN RTP-AUSWEIS: Der Rückgabewert hängt von der Tauschentscheidung ab. Ein Erwartungswert
 * ließe sich nur unter Annahme einer bestimmten Spielweise angeben — das wäre eine
 * Strategieaussage, keine Eigenschaft des Spiels. Deshalb gibt es bewusst keine Tabelle in
 * data/paytables (Regel 6: ohne verifizierte Tabelle kein RTP).
 *
 * Zufall (Regel 9): ausschließlich mulberry32 aus lib/rng, gesät mit dem Rundenseed.
 * Kein Zustand zwischen Runden.
 */

/** rank 1–13 (1 = Ass, 11 = Bube, 12 = Dame, 13 = König), suit 0–3 (Kreuz, Karo, Herz, Pik). */
export type PokerCard = { rank: number; suit: number };

export const DECK_SIZE = 52;
export const HAND_SIZE = 5;

export type HandCategory =
  | "royal-flush"
  | "straight-flush"
  | "four-of-a-kind"
  | "full-house"
  | "flush"
  | "straight"
  | "three-of-a-kind"
  | "two-pair"
  | "jacks-or-better"
  | "none";

/** Gewinntabelle 9/6, Ein-Münzen-Spalte. Reihenfolge = Anzeigereihenfolge (höchste zuerst). */
export const PAYTABLE: readonly { category: HandCategory; label: string; multiplier: number }[] = [
  { category: "royal-flush", label: "Royal Flush", multiplier: 250 },
  { category: "straight-flush", label: "Straight Flush", multiplier: 50 },
  { category: "four-of-a-kind", label: "Vierling", multiplier: 25 },
  { category: "full-house", label: "Full House", multiplier: 9 },
  { category: "flush", label: "Flush", multiplier: 6 },
  { category: "straight", label: "Straße", multiplier: 4 },
  { category: "three-of-a-kind", label: "Drilling", multiplier: 3 },
  { category: "two-pair", label: "Zwei Paare", multiplier: 2 },
  { category: "jacks-or-better", label: "Paar Buben oder besser", multiplier: 1 },
  { category: "none", label: "Keine Gewinnkombination", multiplier: 0 },
];

const MULTIPLIER: Record<HandCategory, number> = PAYTABLE.reduce(
  (acc, e) => {
    acc[e.category] = e.multiplier;
    return acc;
  },
  {} as Record<HandCategory, number>,
);

const LABEL: Record<HandCategory, string> = PAYTABLE.reduce(
  (acc, e) => {
    acc[e.category] = e.label;
    return acc;
  },
  {} as Record<HandCategory, string>,
);

/** Höchster Multiplikator der Tabelle — Grundlage für die deklarierte Obergrenze der Rückgabe. */
export const MAX_MULTIPLIER = PAYTABLE.reduce((max, e) => Math.max(max, e.multiplier), 0);

export function multiplierFor(category: HandCategory): number {
  return MULTIPLIER[category];
}

export function labelFor(category: HandCategory): string {
  return LABEL[category];
}

/** Index 0–51 → Karte. rank = i%13+1, suit = ⌊i/13⌋. */
export function cardFromIndex(index: number): PokerCard {
  return { rank: (index % 13) + 1, suit: Math.floor(index / 13) };
}

/**
 * Vollständiges, gemischtes 52-Karten-Deck aus dem Rundenseed (Fisher-Yates, mulberry32).
 * Die ersten fünf Karten sind die Starthand, die folgenden sind die Nachziehkarten in Reihenfolge.
 */
export function shuffledDeck(seed: number): PokerCard[] {
  const rng = mulberry32(seed);
  const idx = new Array<number>(DECK_SIZE);
  for (let i = 0; i < DECK_SIZE; i++) idx[i] = i;
  for (let i = DECK_SIZE - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = idx[i]!;
    idx[i] = idx[j]!;
    idx[j] = tmp;
  }
  return idx.map(cardFromIndex);
}

export type Deal = {
  /** Die fünf Startkarten. */
  hand: PokerCard[];
  /** Nachziehkarten in Reihenfolge — höchstens fünf werden gebraucht. */
  draw: PokerCard[];
};

export function dealHand(seed: number): Deal {
  const deck = shuffledDeck(seed);
  return { hand: deck.slice(0, HAND_SIZE), draw: deck.slice(HAND_SIZE, HAND_SIZE * 2) };
}

/**
 * Ersetzt alle nicht gehaltenen Karten durch die nächsten Nachziehkarten (Positionen bleiben
 * erhalten, damit die Oberfläche die Karten an Ort und Stelle austauschen kann).
 */
export function exchange(deal: Deal, holds: readonly boolean[]): PokerCard[] {
  let next = 0;
  return deal.hand.map((card, i) => {
    if (holds[i]) return card;
    const replacement = deal.draw[next++];
    if (!replacement) throw new Error("Nachziehkarten erschöpft — das Deck wurde falsch aufgebaut.");
    return replacement;
  });
}

/** Sortierte, eindeutige Ränge einer Hand. */
function distinctRanks(cards: readonly PokerCard[]): number[] {
  return [...new Set(cards.map((c) => c.rank))].sort((a, b) => a - b);
}

/**
 * Erkennt eine Straße. Das Ass zählt wahlweise tief (A-2-3-4-5) oder hoch (10-B-D-K-A);
 * eine „Runde“ Straße wie K-A-2-3-4 gibt es nicht.
 */
export function isStraight(cards: readonly PokerCard[]): boolean {
  const ranks = distinctRanks(cards);
  if (ranks.length !== HAND_SIZE) return false;
  const low = ranks[0]!;
  const high = ranks[HAND_SIZE - 1]!;
  if (high - low === 4) return true; // schließt A-2-3-4-5 ein (1..5)
  // Ass hoch: 10, B, D, K, A
  return ranks[0] === 1 && ranks[1] === 10 && ranks[2] === 11 && ranks[3] === 12 && ranks[4] === 13;
}

export function isFlush(cards: readonly PokerCard[]): boolean {
  const first = cards[0];
  if (!first) return false;
  return cards.every((c) => c.suit === first.suit);
}

/** Royal Flush ist die Straße 10-B-D-K-A in einer Farbe — die höchste Straight-Flush-Variante. */
function isRoyalRanks(cards: readonly PokerCard[]): boolean {
  const ranks = distinctRanks(cards);
  return ranks.length === HAND_SIZE && ranks[0] === 1 && ranks[1] === 10 && ranks[2] === 11 && ranks[3] === 12 && ranks[4] === 13;
}

/** Ein Paar zählt nur ab Buben (Bube, Dame, König, Ass). */
function paysAsHighPair(rank: number): boolean {
  return rank === 1 || rank >= 11;
}

/**
 * Bewertet eine Hand aus genau fünf Karten. Reine Funktion, unabhängig von Reihenfolge und Farbe
 * (außer wo die Farbe zur Kombination gehört).
 */
export function evaluateHand(cards: readonly PokerCard[]): HandCategory {
  if (cards.length !== HAND_SIZE) throw new Error(`Eine Hand besteht aus ${HAND_SIZE} Karten, übergeben wurden ${cards.length}.`);

  const counts = new Map<number, number>();
  for (const c of cards) counts.set(c.rank, (counts.get(c.rank) ?? 0) + 1);
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const shape = groups.map(([, n]) => n);

  const flush = isFlush(cards);
  const straight = isStraight(cards);

  if (flush && straight) return isRoyalRanks(cards) ? "royal-flush" : "straight-flush";
  if (shape[0] === 4) return "four-of-a-kind";
  if (shape[0] === 3 && shape[1] === 2) return "full-house";
  if (flush) return "flush";
  if (straight) return "straight";
  if (shape[0] === 3) return "three-of-a-kind";
  if (shape[0] === 2 && shape[1] === 2) return "two-pair";
  if (shape[0] === 2) {
    const pairRank = groups.find(([, n]) => n === 2)![0];
    return paysAsHighPair(pairRank) ? "jacks-or-better" : "none";
  }
  return "none";
}

/**
 * Rückgabe einer Hand in ganzzahligen Hundertsteln (inklusive Einsatz, da der Multiplikator
 * die Gesamtrückgabe beschreibt). Ganzzahliger Einsatz ⇒ ganzzahlige Rückgabe, nie negativ.
 */
export function returnForHand(cards: readonly PokerCard[], stakeMinor: number): number {
  return stakeMinor * multiplierFor(evaluateHand(cards));
}

/** Serialisierbare Runden-Daten für die Darstellung (EngineOutcome.detail). */
export type VideoPokerDetail = {
  hand: PokerCard[];
  draw: PokerCard[];
  seed: number;
};

/**
 * Startet eine interaktive Runde: teilt die Starthand aus und deklariert die Obergrenze der
 * Rückgabe (Einsatz × höchster Multiplikator). Die tatsächliche Rückgabe steht erst nach dem
 * Tausch fest und wird über `settle` gebucht — die Oberfläche kann keinen Betrag erfinden.
 */
export function resolveVideoPokerRound(input: EngineResolveInput): EngineOutcome {
  const deal = dealHand(input.seed);
  const detail: VideoPokerDetail = { hand: deal.hand, draw: deal.draw, seed: input.seed };
  return {
    outcomeKey: "dealt",
    outcomeLabel: "Karten gegeben",
    returnMinor: 0,
    maxReturnMinor: input.stakeMinor * MAX_MULTIPLIER,
    detail: detail as unknown as Record<string, unknown>,
  };
}

/** Schließt die Runde ab: Endhand, Kategorie, Rückgabe. Deterministisch aus Seed und Halteauswahl. */
export function finishVideoPokerRound(
  seed: number,
  holds: readonly boolean[],
  stakeMinor: number,
): { finalHand: PokerCard[]; category: HandCategory; multiplier: number; returnMinor: number; outcomeLabel: string } {
  const deal = dealHand(seed);
  const finalHand = exchange(deal, holds);
  const category = evaluateHand(finalHand);
  const multiplier = multiplierFor(category);
  return {
    finalHand,
    category,
    multiplier,
    returnMinor: stakeMinor * multiplier,
    outcomeLabel: labelFor(category),
  };
}
