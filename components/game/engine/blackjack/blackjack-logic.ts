import { mulberry32 } from "@/lib/rng";
import type { CreditsMinor } from "@/types/money";

/**
 * Blackjack-Fachlogik — rein, ohne React, vollständig ohne Rendering testbar.
 *
 * Regeln dieser Demo (entsprechend der Spielbeschreibung in data/games.ts):
 *  - 6 Decks, vor jeder Runde frisch gemischt — kein Zustand zwischen Runden (Regel 9)
 *  - Dealer zieht bis 17 und steht bei Soft 17
 *  - Blackjack zahlt 3:2, gewöhnlicher Gewinn 1:1, Push = Einsatz zurück
 *  - Verdoppeln nur mit genau zwei Karten; Teilen nur bei gleichem Rang und höchstens einmal;
 *    geteilte Asse erhalten genau eine Karte und stehen dann
 *  - hat Spieler oder Dealer nach dem Austeilen einen Blackjack, endet die Runde sofort
 *  - keine Versicherung, kein Aufgeben (bewusst weggelassene Nebenwetten, siehe Bericht)
 *
 * Zufall ausschließlich über mulberry32 mit dem Rundenseed (Fisher-Yates-Mischen).
 * Gleicher Seed + gleiche Aktionsfolge ⇒ identisches Ergebnis.
 */

// ─── Karten und Schlitten ────────────────────────────────────────────────────

export const SUITS = ["hearts", "diamonds", "clubs", "spades"] as const;
export type Suit = (typeof SUITS)[number];

export const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"] as const;
export type Rank = (typeof RANKS)[number];

export type Card = { rank: Rank; suit: Suit };

export const DECK_COUNT = 6;
export const SHOE_SIZE = DECK_COUNT * 52;

/** Unveränderliche Vorlage; createShoe kopiert nur Referenzen — Karten sind immutable. */
const SHOE_TEMPLATE: readonly Card[] = (() => {
  const cards: Card[] = [];
  for (let deck = 0; deck < DECK_COUNT; deck += 1) {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        cards.push({ rank, suit });
      }
    }
  }
  return cards;
})();

/** 6 Decks (312 Karten), gemischt per Fisher-Yates mit mulberry32(seed). */
export function createShoe(seed: number): Card[] {
  const cards = [...SHOE_TEMPLATE];
  const rng = mulberry32(seed);
  for (let i = cards.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const a = cards[i];
    const b = cards[j];
    if (a !== undefined && b !== undefined) {
      cards[i] = b;
      cards[j] = a;
    }
  }
  return cards;
}

function cardAt(shoe: readonly Card[], index: number): Card {
  const card = shoe[index];
  // Praktisch unerreichbar: eine Runde aus einem frischen 312-Karten-Schlitten
  // benötigt höchstens rund zwei Dutzend Karten.
  if (card === undefined) throw new Error("Der Kartenschlitten ist erschöpft.");
  return card;
}

// ─── Handwerte ───────────────────────────────────────────────────────────────

function cardBaseValue(rank: Rank): number {
  if (rank === "A") return 11;
  if (rank === "J" || rank === "Q" || rank === "K") return 10;
  return Number(rank);
}

export type HandValue = {
  total: number;
  /** true, wenn mindestens ein Ass noch als 11 zählt („weiche“ Hand). */
  soft: boolean;
};

/** Bester Handwert; Asse zählen 11, solange die Hand damit nicht über 21 geht. */
export function handValue(cards: readonly Card[]): HandValue {
  let total = 0;
  let acesAsEleven = 0;
  for (const card of cards) {
    total += cardBaseValue(card.rank);
    if (card.rank === "A") acesAsEleven += 1;
  }
  while (total > 21 && acesAsEleven > 0) {
    total -= 10;
    acesAsEleven -= 1;
  }
  return { total, soft: acesAsEleven > 0 };
}

export function isBust(cards: readonly Card[]): boolean {
  return handValue(cards).total > 21;
}

/** Blackjack = genau zwei Karten mit Wert 21 (Ass + Zehnerkarte). */
export function isBlackjack(cards: readonly Card[]): boolean {
  return cards.length === 2 && handValue(cards).total === 21;
}

// ─── Dealer ──────────────────────────────────────────────────────────────────

/**
 * Dealer zieht, bis er mindestens 17 erreicht — und steht auf JEDER 17,
 * auch auf Soft 17 (so beschreibt es data/games.ts: „Dealer steht bei Soft 17“).
 */
export function dealerPlay(
  cards: readonly Card[],
  shoe: readonly Card[],
  drawIndex: number,
): { cards: Card[]; drawIndex: number } {
  const hand = [...cards];
  let index = drawIndex;
  while (handValue(hand).total < 17) {
    hand.push(cardAt(shoe, index));
    index += 1;
  }
  return { cards: hand, drawIndex: index };
}

// ─── Abrechnung einer einzelnen Hand ────────────────────────────────────────

export type HandResultKind = "blackjack" | "win" | "push" | "lose" | "bust" | "dealer-blackjack";

export const HAND_RESULT_LABEL: Record<HandResultKind, string> = {
  blackjack: "Blackjack — Auszahlung 3:2",
  win: "Gewonnen",
  push: "Push — Einsatz zurück",
  lose: "Verloren",
  bust: "Überkauft — über 21",
  "dealer-blackjack": "Verloren — Dealer hat Blackjack",
};

const HAND_RESULT_SHORT: Record<HandResultKind, string> = {
  blackjack: "Blackjack",
  win: "gewonnen",
  push: "Push",
  lose: "verloren",
  bust: "überkauft",
  "dealer-blackjack": "verloren (Dealer-Blackjack)",
};

export type SettleHandResult = {
  kind: HandResultKind;
  /** Bruttorückgabe dieser Hand: Einsatz plus Gewinn; 0 bei Verlust. Immer ganzzahlig. */
  grossMinor: CreditsMinor;
};

/**
 * Rechnet eine Spielerhand gegen die fertige Dealerhand ab.
 *  - Überkauft verliert immer, auch wenn der Dealer ebenfalls überkauft
 *  - Blackjack zahlt 3:2 (bei ungeradem Einsatz abgerundet, bleibt ganzzahlig)
 *  - `naturalEligible` ist false für geteilte oder verdoppelte Hände — deren 21 aus zwei
 *    Karten zählt als gewöhnliche 21, nicht als Blackjack
 */
export function settleHand(
  playerCards: readonly Card[],
  dealerCards: readonly Card[],
  betMinor: CreditsMinor,
  options?: { naturalEligible?: boolean },
): SettleHandResult {
  const naturalEligible = options?.naturalEligible ?? true;
  const player = handValue(playerCards);
  if (player.total > 21) return { kind: "bust", grossMinor: 0 };

  const dealerNatural = isBlackjack(dealerCards);
  const natural = naturalEligible && isBlackjack(playerCards);
  if (dealerNatural && natural) return { kind: "push", grossMinor: betMinor };
  if (dealerNatural) return { kind: "dealer-blackjack", grossMinor: 0 };
  if (natural) return { kind: "blackjack", grossMinor: betMinor + Math.floor((betMinor * 3) / 2) };

  const dealer = handValue(dealerCards);
  if (dealer.total > 21) return { kind: "win", grossMinor: betMinor * 2 };
  if (player.total > dealer.total) return { kind: "win", grossMinor: betMinor * 2 };
  if (player.total === dealer.total) return { kind: "push", grossMinor: betMinor };
  return { kind: "lose", grossMinor: 0 };
}

// ─── Rundenzustand (reiner Zustandsautomat, von der UI bedient) ─────────────

export type BlackjackAction = "hit" | "stand" | "double" | "split";

export type PlayerHand = {
  cards: Card[];
  /** Einsatz dieser Hand: Grundeinsatz, ×2 nach Verdoppeln. */
  betMinor: CreditsMinor;
  doubled: boolean;
  fromSplit: boolean;
  /** Geteilte Asse erhalten genau eine Karte und stehen dann. */
  splitAces: boolean;
  done: boolean;
};

export type RoundPhase = "player" | "done";

export type RoundState = {
  seed: number;
  shoe: readonly Card[];
  drawIndex: number;
  baseBetMinor: CreditsMinor;
  hands: PlayerHand[];
  /** Index der Hand, die am Zug ist (nur in Phase „player“ aussagekräftig). */
  activeHand: number;
  dealer: Card[];
  /** true, wenn die Runde direkt nach dem Austeilen durch einen Blackjack endete. */
  naturalEnd: boolean;
  phase: RoundPhase;
};

/** Teilt die Startkarten aus. Endet die Runde per Blackjack sofort, ist phase bereits „done“. */
export function beginRound(seed: number, betMinor: CreditsMinor): RoundState {
  if (!Number.isInteger(betMinor) || betMinor <= 0) {
    throw new Error("Der Einsatz muss eine positive ganze Zahl in Hundertsteln sein.");
  }
  const shoe = createShoe(seed);
  // Austeilreihenfolge wie am Tisch: Spieler, Dealer, Spieler, Dealer (zweite Dealerkarte verdeckt).
  const playerCards = [cardAt(shoe, 0), cardAt(shoe, 2)];
  const dealer = [cardAt(shoe, 1), cardAt(shoe, 3)];
  const naturalEnd = isBlackjack(playerCards) || isBlackjack(dealer);
  const hand: PlayerHand = {
    cards: playerCards,
    betMinor,
    doubled: false,
    fromSplit: false,
    splitAces: false,
    done: naturalEnd,
  };
  return {
    seed,
    shoe,
    drawIndex: 4,
    baseBetMinor: betMinor,
    hands: [hand],
    activeHand: 0,
    dealer,
    naturalEnd,
    phase: naturalEnd ? "done" : "player",
  };
}

/** Zulässige Aktionen für die gerade aktive Hand. Leer, wenn die Runde nicht in Phase „player“ ist. */
export function availableActions(state: RoundState): BlackjackAction[] {
  if (state.phase !== "player") return [];
  const hand = state.hands[state.activeHand];
  if (hand === undefined || hand.done) return [];
  const actions: BlackjackAction[] = ["hit", "stand"];
  if (hand.cards.length === 2 && !hand.doubled) actions.push("double");
  if (
    hand.cards.length === 2 &&
    state.hands.length === 1 && // höchstens ein Split pro Runde
    hand.cards[0]?.rank === hand.cards[1]?.rank
  ) {
    actions.push("split");
  }
  return actions;
}

/**
 * Wendet eine Spieleraktion an und gibt einen neuen Zustand zurück (Eingabe bleibt unverändert).
 * Sind danach alle Hände fertig, spielt der Dealer automatisch aus und phase wird „done“.
 * Unzulässige Aktionen werfen — die UI bietet nur availableActions() an.
 */
export function applyAction(state: RoundState, action: BlackjackAction): RoundState {
  if (!availableActions(state).includes(action)) {
    throw new Error(`Aktion „${action}“ ist in diesem Rundenzustand nicht zulässig.`);
  }
  const hands = state.hands.map((h) => ({ ...h, cards: [...h.cards] }));
  const hand = hands[state.activeHand];
  if (hand === undefined) throw new Error("Keine aktive Hand.");
  let drawIndex = state.drawIndex;
  const draw = (): Card => {
    const card = cardAt(state.shoe, drawIndex);
    drawIndex += 1;
    return card;
  };

  switch (action) {
    case "hit": {
      hand.cards.push(draw());
      break;
    }
    case "stand": {
      hand.done = true;
      break;
    }
    case "double": {
      // Verdoppeln: Einsatz der Hand ×2, genau eine weitere Karte, dann stehen.
      hand.betMinor *= 2;
      hand.doubled = true;
      hand.cards.push(draw());
      hand.done = true;
      break;
    }
    case "split": {
      const [first, second] = hand.cards;
      if (first === undefined || second === undefined) throw new Error("Teilen erfordert zwei Karten.");
      const aces = first.rank === "A";
      const makeHand = (start: Card): PlayerHand => ({
        cards: [start, draw()],
        betMinor: state.baseBetMinor,
        doubled: false,
        fromSplit: true,
        splitAces: aces,
        done: aces, // geteilte Asse: genau eine Karte, dann stehen
      });
      hands.splice(state.activeHand, 1, makeHand(first), makeHand(second));
      break;
    }
  }

  return advance({ ...state, hands, drawIndex });
}

/** Markiert Hände mit 21 oder mehr als fertig, wählt die nächste offene Hand oder lässt den Dealer ausspielen. */
function advance(state: RoundState): RoundState {
  const hands = state.hands.map((h) =>
    !h.done && handValue(h.cards).total >= 21 ? { ...h, done: true } : h,
  );
  const nextIndex = hands.findIndex((h) => !h.done);
  if (nextIndex !== -1) return { ...state, hands, activeHand: nextIndex };
  return playOutDealer({ ...state, hands });
}

function playOutDealer(state: RoundState): RoundState {
  // Sind alle Spielerhände überkauft, deckt der Dealer nur auf und zieht nicht.
  const anyLive = state.hands.some((h) => !isBust(h.cards));
  if (!anyLive) return { ...state, phase: "done" };
  const played = dealerPlay(state.dealer, state.shoe, state.drawIndex);
  return { ...state, dealer: played.cards, drawIndex: played.drawIndex, phase: "done" };
}

// ─── Rundenabrechnung ────────────────────────────────────────────────────────

/**
 * Obergrenze der Rückgabe, die beim Rundenstart gegenüber dem Wallet-Reducer deklariert wird
 * (maxReturnMinor im EngineOutcome). Bezugsgröße ist der GRUNDEINSATZ E.
 *
 * Herleitung:
 *  - Jeder Zusatzeinsatz aus Verdoppeln oder Teilen wird über RAISE_ROUND_STAKE regulär gebucht.
 *    Der Reducer zieht die Obergrenze dabei im selben Verhältnis mit wie den Einsatz; das
 *    Verhältnis Obergrenze/Gesamteinsatz bleibt also über die ganze Runde konstant bei 5.
 *  - Höchster Gesamteinsatz: Teilen (2 Hände) und Verdoppeln beider Hände ⇒ 4E.
 *  - Höchste Bruttoauszahlung je Hand: 2 × Handeinsatz (Gewinn 1:1 plus Einsatz zurück).
 *    Über alle Hände also höchstens 2 × Gesamteinsatz — bei jedem Zwischenstand:
 *      ohne Erhöhung   Einsatz 1E, Brutto ≤ 2,5E (Blackjack 3:2), Rahmen  5E
 *      nur Verdoppeln  Einsatz 2E, Brutto ≤ 4E,                   Rahmen 10E
 *      nur Teilen      Einsatz 2E, Brutto ≤ 4E,                   Rahmen 10E
 *      Teilen + 1×     Einsatz 3E, Brutto ≤ 6E,                   Rahmen 15E
 *      Teilen + 2×     Einsatz 4E, Brutto ≤ 8E,                   Rahmen 20E
 *  - Faktor 5 ist damit bewusst großzügig (der scharfe Wert wäre 2,5), bleibt aber für jeden
 *    ganzzahligen Einsatz selbst ganzzahlig und übersteht die Verhältnisrechnung des Reducers
 *    ohne Rundungsverlust. Ein zu enger Rahmen würde korrekte Auszahlungen ablehnen.
 */
export function maxReturnFor(betMinor: CreditsMinor): CreditsMinor {
  return betMinor * 5;
}

export type HandResult = SettleHandResult & { betMinor: CreditsMinor };

export type RoundSettlement = {
  results: HandResult[];
  /** Effektiver Gesamteinsatz über alle Hände (Grundeinsatz plus Zusatzeinsätze). */
  totalBetMinor: CreditsMinor;
  /** Zusatzeinsatz aus Verdoppeln/Teilen: totalBet − Grundeinsatz. */
  extraBetMinor: CreditsMinor;
  /** Bruttoauszahlung über alle Hände — zugleich der Betrag für settle(). */
  grossReturnMinor: CreditsMinor;
  /** Betrag für settle(): die Bruttoauszahlung, ganzzahlig und nie negativ. */
  returnMinor: CreditsMinor;
  outcomeKey: string;
  outcomeLabel: string;
};

/**
 * Rechnet eine abgeschlossene Runde ab.
 *
 * Zusatzeinsätze aus Verdoppeln und Teilen sind während der Runde über RAISE_ROUND_STAKE
 * regulär vom Guthaben gebucht worden (eigene demo_bet-Transaktion mit derselben roundId).
 * Die Rückgabe ist deshalb die volle Bruttoauszahlung — nichts wird gegengerechnet.
 * `totalBetMinor` und `extraBetMinor` dienen nur der Anzeige.
 */
export function roundSettlement(state: RoundState): RoundSettlement {
  if (state.phase !== "done") throw new Error("Die Runde ist noch nicht abgeschlossen.");
  const singleHand = state.hands.length === 1;
  const results: HandResult[] = state.hands.map((hand) => {
    const settled = settleHand(hand.cards, state.dealer, hand.betMinor, {
      // 21 aus zwei Karten zählt nach Split oder Double nicht als Blackjack.
      naturalEligible: singleHand && !hand.doubled && !hand.fromSplit,
    });
    return { ...settled, betMinor: hand.betMinor };
  });

  const totalBetMinor = results.reduce((sum, r) => sum + r.betMinor, 0);
  const grossReturnMinor = results.reduce((sum, r) => sum + r.grossMinor, 0);
  const extraBetMinor = totalBetMinor - state.baseBetMinor;
  const returnMinor = grossReturnMinor;

  const first = results[0];
  if (first === undefined) throw new Error("Runde ohne Hand kann nicht abgerechnet werden.");
  let outcomeKey: string;
  let outcomeLabel: string;
  if (results.length === 1) {
    outcomeKey = first.kind;
    outcomeLabel = HAND_RESULT_LABEL[first.kind];
  } else {
    const kinds = results.map((r) => r.kind);
    outcomeKey = `split-${kinds.join("-")}`;
    outcomeLabel = results.map((r, i) => `Hand ${i + 1} ${HAND_RESULT_SHORT[r.kind]}`).join(" · ");
  }

  return { results, totalBetMinor, extraBetMinor, grossReturnMinor, returnMinor, outcomeKey, outcomeLabel };
}
