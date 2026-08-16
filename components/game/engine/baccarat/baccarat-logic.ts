import { mulberry32 } from "@/lib/rng";
import type { EngineOutcome, EngineResolveInput } from "@/types/engine";

/**
 * Punto Banco (Baccarat) — reine Fachlogik ohne React.
 *
 * Regeln (vollständig, keine Vereinfachung):
 *  - Kartenwerte: 10/Bube/Dame/König = 0, Ass = 1, übrige Karten Nennwert; Punktzahl modulo 10.
 *  - Gegeben wird abwechselnd Spieler, Bank, Spieler, Bank aus einem Schuh mit 8 Decks.
 *  - Natural: Hat Spieler oder Bank mit zwei Karten 8 oder 9, endet der Coup sofort.
 *  - Spieler: zieht bei 0–5 eine dritte Karte, steht bei 6–7.
 *  - Bank: steht der Spieler (keine dritte Karte), zieht die Bank bei 0–5 und steht bei 6–7.
 *    Zieht der Spieler, entscheidet der PUNKTWERT der dritten Spielerkarte (Tabelle in
 *    `bankerDrawsThird`). Das ist die vollständige Ziehtabelle des Punto Banco.
 *
 * Zufall (Regel 9): ausschließlich mulberry32 aus lib/rng, gesät mit dem Rundenseed.
 * Jede Runde spielt aus einem frisch gemischten 8-Deck-Schuh — kein Zustand zwischen Runden.
 * Die dokumentierten Wahrscheinlichkeiten (data/paytables/baccarat.ts) gelten genau für
 * diesen Fall „erster Coup aus vollem Schuh“ und werden im Test per Simulation belegt.
 */

export type BaccaratBetId = "player" | "banker" | "tie";
export type CoupResult = "player" | "banker" | "tie";

/** rank 1–13 (1 = Ass, 11 = Bube, 12 = Dame, 13 = König), suit 0–3 (Kreuz, Karo, Herz, Pik). */
export type BaccaratCard = { rank: number; suit: number };

export const DECK_COUNT = 8;
export const SHOE_SIZE = 52 * DECK_COUNT; // 416 Karten

/** Punktwert einer Karte: 10/B/D/K = 0, Ass = 1, sonst Nennwert. */
export function cardPoints(rank: number): number {
  return rank >= 10 ? 0 : rank;
}

/** Punktzahl einer Hand: Summe der Kartenwerte modulo 10. */
export function handPoints(cards: readonly BaccaratCard[]): number {
  let sum = 0;
  for (const c of cards) sum += cardPoints(c.rank);
  return sum % 10;
}

/** Spielerregel: dritte Karte bei 0–5, stehen bei 6–7. (Naturals behandelt `playCoup`.) */
export function playerDrawsThird(playerTotal: number): boolean {
  return playerTotal <= 5;
}

/**
 * Bankregel — die vollständige Ziehtabelle des Punto Banco.
 *
 * `playerThirdPoints` ist der Punktwert der dritten Spielerkarte (0–9) oder `null`,
 * wenn der Spieler steht. Steht der Spieler, zieht die Bank wie der Spieler bei 0–5.
 *
 * | Bank | zieht bei dritter Spielerkarte (Punktwert) |
 * |------|--------------------------------------------|
 * | 0–2  | immer                                      |
 * | 3    | 0–7 und 9 (nicht bei 8)                    |
 * | 4    | 2–7                                        |
 * | 5    | 4–7                                        |
 * | 6    | 6–7                                        |
 * | 7    | nie (steht)                                |
 */
export function bankerDrawsThird(bankerTotal: number, playerThirdPoints: number | null): boolean {
  if (playerThirdPoints === null) return bankerTotal <= 5;
  if (bankerTotal <= 2) return true;
  switch (bankerTotal) {
    case 3:
      return playerThirdPoints !== 8;
    case 4:
      return playerThirdPoints >= 2 && playerThirdPoints <= 7;
    case 5:
      return playerThirdPoints >= 4 && playerThirdPoints <= 7;
    case 6:
      return playerThirdPoints === 6 || playerThirdPoints === 7;
    default:
      return false; // 7 steht; 8/9 wären Naturals und kommen hier nicht an
  }
}

export type Coup = {
  playerCards: BaccaratCard[];
  bankerCards: BaccaratCard[];
  playerTotal: number;
  bankerTotal: number;
  result: CoupResult;
  /** true, wenn der Coup durch ein Natural (8/9 aus zwei Karten) endete. */
  natural: boolean;
};

/**
 * Spielt einen Coup mit einem Kartenlieferanten. Der Lieferant abstrahiert den Schuh,
 * damit die Ziehregeln im Test mit fest vorgegebenen Karten geprüft werden können.
 */
export function playCoup(draw: () => BaccaratCard): Coup {
  // Gebe-Reihenfolge: Spieler, Bank, Spieler, Bank.
  const p1 = draw();
  const b1 = draw();
  const p2 = draw();
  const b2 = draw();
  const playerCards = [p1, p2];
  const bankerCards = [b1, b2];

  let playerTotal = handPoints(playerCards);
  let bankerTotal = handPoints(bankerCards);
  const natural = playerTotal >= 8 || bankerTotal >= 8;

  if (!natural) {
    let playerThirdPoints: number | null = null;
    if (playerDrawsThird(playerTotal)) {
      const third = draw();
      playerCards.push(third);
      playerThirdPoints = cardPoints(third.rank);
      playerTotal = handPoints(playerCards);
    }
    if (bankerDrawsThird(bankerTotal, playerThirdPoints)) {
      bankerCards.push(draw());
      bankerTotal = handPoints(bankerCards);
    }
  }

  const result: CoupResult = playerTotal > bankerTotal ? "player" : bankerTotal > playerTotal ? "banker" : "tie";
  return { playerCards, bankerCards, playerTotal, bankerTotal, result, natural };
}

/** Index 0–415 → Karte. Innerhalb eines 52er-Blocks: rank = i%13+1, suit = ⌊i/13⌋. */
export function cardFromIndex(index: number): BaccaratCard {
  const inDeck = index % 52;
  return { rank: (inDeck % 13) + 1, suit: Math.floor(inDeck / 13) };
}

// Vorlage des vollen Schuhs; wird pro Runde kopiert, damit keine Runde Zustand hinterlässt.
const SHOE_TEMPLATE = (() => {
  const t = new Uint16Array(SHOE_SIZE);
  for (let i = 0; i < SHOE_SIZE; i++) t[i] = i;
  return t;
})();

/**
 * Spielt einen Coup aus einem frisch gemischten 8-Deck-Schuh. Deterministisch:
 * gleicher Seed ⇒ identische Karten und identisches Ergebnis.
 *
 * Gemischt wird per partiellem Fisher-Yates: Für jede gezogene Karte wird gleichverteilt
 * eine der verbleibenden gewählt — das ist verteilungsgleich mit einem komplett
 * gemischten Schuh, zieht aber nur die maximal 6 benötigten Karten.
 *
 * `scratch` ist ein optionaler Wiederverwendungspuffer für Massensimulationen (Tests);
 * er wird bei jedem Aufruf vollständig neu befüllt und beeinflusst das Ergebnis nicht.
 */
export function dealCoup(seed: number, scratch?: Uint16Array): Coup {
  const rng = mulberry32(seed);
  const shoe = scratch && scratch.length === SHOE_SIZE ? scratch : new Uint16Array(SHOE_SIZE);
  shoe.set(SHOE_TEMPLATE);
  let drawn = 0;
  const draw = (): BaccaratCard => {
    const j = drawn + Math.floor(rng() * (SHOE_SIZE - drawn));
    const picked = shoe[j]!;
    shoe[j] = shoe[drawn]!;
    shoe[drawn] = picked;
    drawn++;
    return cardFromIndex(picked);
  };
  return playCoup(draw);
}

/**
 * Rückgabe einer Wette in ganzzahligen Hundertsteln (inklusive Einsatz).
 *
 *  - Spieler: 1:1 → Rückgabe 2 × Einsatz.
 *  - Bank: 1:1 abzüglich 5 % Kommission auf den Gewinnanteil.
 *    Rundungsregel: Die Kommission (Einsatz / 20) wird auf den nächsten ganzen
 *    Minor-Betrag AUFGERUNDET — zugunsten der Bank, nie des Spielers, wie im
 *    realen Spielbetrieb. Rückgabe = 2 × Einsatz − ⌈Einsatz / 20⌉.
 *  - Unentschieden: 8:1 → Rückgabe 9 × Einsatz.
 *  - Bei Unentschieden erhalten Spieler- und Bank-Wetten den Einsatz zurück (Push).
 *
 * Bei ganzzahligem Einsatz ist die Rückgabe immer ganzzahlig und nie negativ.
 */
export function resolveBet(bet: BaccaratBetId, result: CoupResult, stakeMinor: number): number {
  if (bet === "tie") return result === "tie" ? stakeMinor * 9 : 0;
  if (result === "tie") return stakeMinor; // Push
  if (bet === "player") return result === "player" ? stakeMinor * 2 : 0;
  return result === "banker" ? stakeMinor * 2 - Math.ceil(stakeMinor / 20) : 0;
}

export const BACCARAT_BET_IDS: readonly BaccaratBetId[] = ["player", "banker", "tie"];

export function isBaccaratBetId(value: string | undefined): value is BaccaratBetId {
  return value === "player" || value === "banker" || value === "tie";
}

/**
 * Bezeichnung des Coup-Ausgangs. Bewusst ohne „gewinnt": Der Ausgang benennt die vorn liegende
 * Seite des Tisches, nicht das Ergebnis der spielenden Person. Stand dort „Bank gewinnt", während
 * auf Spieler gesetzt wurde und netto −1,00 Credits herauskommen, läse sich ein Verlust im
 * ersten Moment wie ein Gewinn — genau die Verwechslung, die Regel 7 ausschließt.
 */
const RESULT_LABEL: Record<CoupResult, string> = {
  player: "Spielerseite vorn",
  banker: "Bankseite vorn",
  tie: "Unentschieden",
};

/** Serialisierbare Coup-Daten für die Darstellung (EngineOutcome.detail). */
export type BaccaratDetail = {
  bet: BaccaratBetId;
  playerCards: BaccaratCard[];
  bankerCards: BaccaratCard[];
  playerTotal: number;
  bankerTotal: number;
  result: CoupResult;
  natural: boolean;
};

/**
 * Löst eine komplette Runde auf: Coup aus dem Seed, Rückgabe aus der gewählten Wette.
 * `outcomeKey` verweist auf die Ergebnisklassen der Auszahlungstabelle
 * (`win`/`push`/`lose` bzw. `win`/`lose` bei der Unentschieden-Wette).
 */
export function resolveBaccaratRound(input: EngineResolveInput): EngineOutcome {
  const bet: BaccaratBetId = isBaccaratBetId(input.betId) ? input.betId : "player";
  const coup = dealCoup(input.seed);
  const returnMinor = resolveBet(bet, coup.result, input.stakeMinor);

  const outcomeKey =
    bet === "tie"
      ? coup.result === "tie"
        ? "win"
        : "lose"
      : coup.result === "tie"
        ? "push"
        : coup.result === bet
          ? "win"
          : "lose";

  const outcomeLabel =
    coup.result === "tie" && bet !== "tie"
      ? `${RESULT_LABEL.tie} ${coup.playerTotal}:${coup.bankerTotal} — Einsatz zurück`
      : `${RESULT_LABEL[coup.result]} ${coup.playerTotal}:${coup.bankerTotal}`;

  const detail: BaccaratDetail = {
    bet,
    playerCards: coup.playerCards,
    bankerCards: coup.bankerCards,
    playerTotal: coup.playerTotal,
    bankerTotal: coup.bankerTotal,
    result: coup.result,
    natural: coup.natural,
  };

  return { outcomeKey, outcomeLabel, returnMinor, detail: detail as unknown as Record<string, unknown> };
}
