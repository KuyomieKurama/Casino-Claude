import { describe, expect, it } from "vitest";
import { paytablesOf } from "@/data/paytables";
import { videoPokerPaytables } from "@/data/paytables/videopoker";
import {
  DECK_SIZE,
  HAND_SIZE,
  MAX_MULTIPLIER,
  PAYTABLE,
  cardFromIndex,
  dealHand,
  evaluateHand,
  exchange,
  finishVideoPokerRound,
  isFlush,
  isStraight,
  labelFor,
  multiplierFor,
  resolveVideoPokerRound,
  returnForHand,
  shuffledDeck,
  type HandCategory,
  type PokerCard,
} from "./videopoker-logic";

/** Karte aus Kurzschreibweise, z. B. "AH" (Ass Herz), "TP" (Zehn Pik), "BK" (Bube Kreuz). */
function card(short: string): PokerCard {
  const rankPart = short.slice(0, short.length - 1);
  const suitPart = short.slice(-1);
  const rankMap: Record<string, number> = { A: 1, T: 10, B: 11, D: 12, K: 13 };
  const suitMap: Record<string, number> = { C: 0, D: 1, H: 2, P: 3 };
  const rank = rankMap[rankPart] ?? Number.parseInt(rankPart, 10);
  const suit = suitMap[suitPart];
  if (rank === undefined || Number.isNaN(rank) || suit === undefined) throw new Error(`Unlesbare Testkarte: ${short}`);
  return { rank, suit };
}

const hand = (...shorts: string[]): PokerCard[] => shorts.map(card);

describe("Video Poker — Deck", () => {
  it("cardFromIndex erzeugt genau ein vollständiges 52-Karten-Deck", () => {
    const seen = new Set<string>();
    for (let i = 0; i < DECK_SIZE; i++) {
      const c = cardFromIndex(i);
      expect(c.rank).toBeGreaterThanOrEqual(1);
      expect(c.rank).toBeLessThanOrEqual(13);
      expect(c.suit).toBeGreaterThanOrEqual(0);
      expect(c.suit).toBeLessThanOrEqual(3);
      seen.add(`${c.rank}-${c.suit}`);
    }
    expect(seen.size).toBe(DECK_SIZE);
  });

  it("das gemischte Deck enthält jede Karte genau einmal", () => {
    for (const seed of [1, 2, 77, 123456, 4294967295]) {
      const deck = shuffledDeck(seed);
      expect(deck).toHaveLength(DECK_SIZE);
      expect(new Set(deck.map((c) => `${c.rank}-${c.suit}`)).size).toBe(DECK_SIZE);
    }
  });

  it("Starthand und Nachziehkarten überschneiden sich nie", () => {
    for (let seed = 1; seed <= 2000; seed++) {
      const deal = dealHand(seed);
      expect(deal.hand).toHaveLength(HAND_SIZE);
      expect(deal.draw).toHaveLength(HAND_SIZE);
      const all = [...deal.hand, ...deal.draw].map((c) => `${c.rank}-${c.suit}`);
      expect(new Set(all).size).toBe(2 * HAND_SIZE);
    }
  });

  it("die Endhand enthält nach jedem Tausch fünf verschiedene Karten", () => {
    for (let seed = 1; seed <= 500; seed++) {
      const deal = dealHand(seed);
      for (let mask = 0; mask < 32; mask++) {
        const holds = Array.from({ length: HAND_SIZE }, (_, i) => (mask & (1 << i)) !== 0);
        const finalHand = exchange(deal, holds);
        expect(finalHand).toHaveLength(HAND_SIZE);
        expect(new Set(finalHand.map((c) => `${c.rank}-${c.suit}`)).size).toBe(HAND_SIZE);
        // Gehaltene Karten bleiben an ihrer Position liegen.
        holds.forEach((held, i) => {
          if (held) expect(finalHand[i]).toEqual(deal.hand[i]);
        });
      }
    }
  });
});

describe("Video Poker — Handbewertung", () => {
  const cases: readonly { name: string; cards: PokerCard[]; category: HandCategory }[] = [
    { name: "Royal Flush", cards: hand("TH", "BH", "DH", "KH", "AH"), category: "royal-flush" },
    { name: "Straight Flush 9 bis K", cards: hand("9P", "TP", "BP", "DP", "KP"), category: "straight-flush" },
    { name: "Straight Flush ass-tief (Steel Wheel)", cards: hand("AC", "2C", "3C", "4C", "5C"), category: "straight-flush" },
    { name: "Vierling", cards: hand("7C", "7D", "7H", "7P", "2C"), category: "four-of-a-kind" },
    { name: "Full House", cards: hand("3C", "3D", "3H", "KP", "KC"), category: "full-house" },
    { name: "Flush", cards: hand("2D", "5D", "9D", "BD", "KD"), category: "flush" },
    { name: "Straße", cards: hand("5C", "6D", "7H", "8P", "9C"), category: "straight" },
    { name: "Straße ass-tief A-2-3-4-5", cards: hand("AC", "2D", "3H", "4P", "5C"), category: "straight" },
    { name: "Straße ass-hoch 10-B-D-K-A", cards: hand("TC", "BD", "DH", "KP", "AC"), category: "straight" },
    { name: "Drilling", cards: hand("9C", "9D", "9H", "2P", "5C"), category: "three-of-a-kind" },
    { name: "Zwei Paare", cards: hand("4C", "4D", "8H", "8P", "KC"), category: "two-pair" },
    { name: "Zwei niedrige Paare zahlen trotzdem", cards: hand("2C", "2D", "3H", "3P", "7C"), category: "two-pair" },
    { name: "Paar Buben", cards: hand("BC", "BD", "2H", "5P", "9C"), category: "jacks-or-better" },
    { name: "Paar Damen", cards: hand("DC", "DD", "2H", "5P", "9C"), category: "jacks-or-better" },
    { name: "Paar Könige", cards: hand("KC", "KD", "2H", "5P", "9C"), category: "jacks-or-better" },
    { name: "Paar Asse", cards: hand("AC", "AD", "2H", "5P", "9C"), category: "jacks-or-better" },
    { name: "Paar Zehnen zahlt nicht", cards: hand("TC", "TD", "2H", "5P", "9C"), category: "none" },
    { name: "Paar Neunen zahlt nicht", cards: hand("9C", "9D", "2H", "5P", "KC"), category: "none" },
    { name: "Paar Zweien zahlt nicht", cards: hand("2C", "2D", "7H", "9P", "KC"), category: "none" },
    { name: "Nur hohe Karten ohne Paar", cards: hand("AC", "KD", "DH", "9P", "5C"), category: "none" },
  ];

  for (const c of cases) {
    it(`erkennt ${c.name}`, () => {
      expect(evaluateHand(c.cards)).toBe(c.category);
    });
  }

  it("Grenzfall: Royal Flush ist kein gewöhnlicher Straight Flush", () => {
    expect(evaluateHand(hand("TH", "BH", "DH", "KH", "AH"))).toBe("royal-flush");
    // Eine Karte tiefer: derselbe Aufbau, aber nur Straight Flush.
    expect(evaluateHand(hand("9H", "TH", "BH", "DH", "KH"))).toBe("straight-flush");
    // Dieselben Ränge in gemischten Farben: nur Straße.
    expect(evaluateHand(hand("TH", "BH", "DH", "KH", "AP"))).toBe("straight");
  });

  it("Grenzfall: K-A-2-3-4 ist keine Straße („runde“ Straßen gibt es nicht)", () => {
    expect(isStraight(hand("KC", "AD", "2H", "3P", "4C"))).toBe(false);
    expect(evaluateHand(hand("KC", "AD", "2H", "3P", "4C"))).toBe("none");
    // Dieselben Karten in einer Farbe sind ein Flush, keine Straight Flush.
    expect(evaluateHand(hand("KC", "AC", "2C", "3C", "4C"))).toBe("flush");
  });

  it("Grenzfall: Full House schlägt Flush und wird nicht als Drilling gewertet", () => {
    expect(evaluateHand(hand("5C", "5D", "5H", "9P", "9C"))).toBe("full-house");
    expect(evaluateHand(hand("9P", "9C", "5C", "5D", "5H"))).toBe("full-house");
  });

  it("die Reihenfolge der Karten ändert die Bewertung nicht", () => {
    const cards = hand("BC", "2H", "BD", "9C", "5P");
    expect(evaluateHand(cards)).toBe("jacks-or-better");
    expect(evaluateHand([...cards].reverse())).toBe("jacks-or-better");
  });

  it("isFlush und isStraight verhalten sich wie erwartet", () => {
    expect(isFlush(hand("2C", "5C", "9C", "BC", "KC"))).toBe(true);
    expect(isFlush(hand("2C", "5C", "9C", "BC", "KD"))).toBe(false);
    expect(isStraight(hand("AC", "2D", "3H", "4P", "5C"))).toBe(true);
    expect(isStraight(hand("TC", "BD", "DH", "KP", "AC"))).toBe(true);
    expect(isStraight(hand("2C", "3D", "4H", "5P", "7C"))).toBe(false);
    expect(isStraight(hand("2C", "2D", "3H", "4P", "5C"))).toBe(false);
  });

  it("eine Hand mit falscher Kartenzahl wird abgelehnt", () => {
    expect(() => evaluateHand(hand("AC", "KD"))).toThrow();
  });
});

describe("Video Poker — Gewinntabelle", () => {
  it("entspricht der 9/6-Variante mit Royal Flush 250 (Ein-Münzen-Spalte)", () => {
    expect(multiplierFor("royal-flush")).toBe(250);
    expect(multiplierFor("straight-flush")).toBe(50);
    expect(multiplierFor("four-of-a-kind")).toBe(25);
    expect(multiplierFor("full-house")).toBe(9);
    expect(multiplierFor("flush")).toBe(6);
    expect(multiplierFor("straight")).toBe(4);
    expect(multiplierFor("three-of-a-kind")).toBe(3);
    expect(multiplierFor("two-pair")).toBe(2);
    expect(multiplierFor("jacks-or-better")).toBe(1);
    expect(multiplierFor("none")).toBe(0);
    expect(MAX_MULTIPLIER).toBe(250);
  });

  it("die Tabelle ist absteigend sortiert und vollständig beschriftet", () => {
    for (let i = 1; i < PAYTABLE.length; i++) {
      expect(PAYTABLE[i]!.multiplier).toBeLessThan(PAYTABLE[i - 1]!.multiplier);
      expect(labelFor(PAYTABLE[i]!.category)).toBeTruthy();
    }
  });

  it("Rückgaben sind ganzzahlig und nie negativ", () => {
    const samples = [
      hand("TH", "BH", "DH", "KH", "AH"),
      hand("7C", "7D", "7H", "7P", "2C"),
      hand("BC", "BD", "2H", "5P", "9C"),
      hand("2C", "5D", "9H", "BP", "KC"),
    ];
    for (const stake of [1, 10, 25, 33, 100, 499, 500]) {
      for (const cards of samples) {
        const r = returnForHand(cards, stake);
        expect(Number.isInteger(r)).toBe(true);
        expect(r).toBeGreaterThanOrEqual(0);
        expect(r).toBeLessThanOrEqual(stake * MAX_MULTIPLIER);
      }
    }
  });

  it("„Paar Buben oder besser“ gibt genau den Einsatz zurück — netto null, kein Gewinn", () => {
    expect(returnForHand(hand("KC", "KD", "2H", "5P", "9C"), 100)).toBe(100);
  });

  it("bewusst keine Auszahlungstabelle in data/paytables (RTP ist strategieabhängig)", () => {
    expect(videoPokerPaytables).toHaveLength(0);
    expect(paytablesOf("g-video-poker")).toHaveLength(0);
  });
});

describe("Video Poker — Runde", () => {
  it("resolveVideoPokerRound deklariert die Obergrenze Einsatz × höchster Multiplikator", () => {
    for (const stake of [10, 100, 500]) {
      const outcome = resolveVideoPokerRound({ stakeMinor: stake, seed: 4242 });
      expect(outcome.returnMinor).toBe(0);
      expect(outcome.maxReturnMinor).toBe(stake * MAX_MULTIPLIER);
      const detail = outcome.detail as { hand: PokerCard[]; draw: PokerCard[]; seed: number };
      expect(detail.hand).toHaveLength(HAND_SIZE);
      expect(detail.draw).toHaveLength(HAND_SIZE);
      expect(detail.seed).toBe(4242);
    }
  });

  it("alle Karten halten liefert genau die Starthand", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const deal = dealHand(seed);
      const finished = finishVideoPokerRound(seed, [true, true, true, true, true], 100);
      expect(finished.finalHand).toEqual(deal.hand);
      expect(finished.category).toBe(evaluateHand(deal.hand));
    }
  });

  it("keine Karte halten liefert genau die fünf Nachziehkarten", () => {
    const deal = dealHand(99);
    const finished = finishVideoPokerRound(99, [false, false, false, false, false], 100);
    expect(finished.finalHand).toEqual(deal.draw);
  });

  it("ist deterministisch: gleicher Seed und gleiche Halteauswahl ⇒ gleiches Ergebnis", () => {
    for (let seed = 1; seed <= 300; seed++) {
      const holds = [seed % 2 === 0, seed % 3 === 0, seed % 5 === 0, seed % 7 === 0, false];
      const a = finishVideoPokerRound(seed, holds, 100);
      const b = finishVideoPokerRound(seed, holds, 100);
      expect(a.finalHand).toEqual(b.finalHand);
      expect(a.category).toBe(b.category);
      expect(a.returnMinor).toBe(b.returnMinor);
    }
  });

  it("unterschiedliche Seeds liefern nicht immer dieselbe Starthand", () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 50; seed++) seen.add(JSON.stringify(dealHand(seed).hand));
    expect(seen.size).toBeGreaterThan(1);
  });

  it("Rückgabe jeder Runde ist ganzzahlig, nie negativ und nie über der Obergrenze", () => {
    for (let seed = 1; seed <= 5000; seed++) {
      const stake = 10 + (seed % 40);
      const holds = [seed % 2 === 0, seed % 3 === 0, seed % 4 === 0, seed % 5 === 0, seed % 6 === 0];
      const finished = finishVideoPokerRound(seed, holds, stake);
      expect(Number.isInteger(finished.returnMinor)).toBe(true);
      expect(finished.returnMinor).toBeGreaterThanOrEqual(0);
      expect(finished.returnMinor).toBeLessThanOrEqual(resolveVideoPokerRound({ stakeMinor: stake, seed }).maxReturnMinor!);
      expect(finished.returnMinor).toBe(stake * finished.multiplier);
    }
  });

  /**
   * Kein RTP-Test: Der Erwartungswert hängt von der Tauschentscheidung ab. Statt eines
   * Prozentwerts wird geprüft, dass über viele Runden jede Kategorie erreichbar ist und die
   * Auszahlung stets der Kategorie folgt — geprüft an der Spielweise „alle Karten tauschen“,
   * die keine Strategie darstellt, sondern nur die Bewertungslogik durchmustert.
   */
  it("über 200.000 Runden treten alle häufigen Kategorien auf und die Auszahlung folgt der Tabelle", () => {
    const counts = new Map<HandCategory, number>();
    const drop: readonly boolean[] = [false, false, false, false, false];
    for (let seed = 1; seed <= 200_000; seed++) {
      const finished = finishVideoPokerRound(seed, drop, 100);
      counts.set(finished.category, (counts.get(finished.category) ?? 0) + 1);
      expect(finished.returnMinor).toBe(100 * multiplierFor(finished.category));
    }
    for (const category of ["none", "jacks-or-better", "two-pair", "three-of-a-kind", "straight", "flush", "full-house", "four-of-a-kind"] as const) {
      expect(counts.get(category) ?? 0, `Kategorie ${category} kam nie vor`).toBeGreaterThan(0);
    }
    // Grobe Plausibilität einer zufälligen Fünf-Karten-Hand (bekannte Werte: Paar ≈ 42 %,
    // zwei Paare ≈ 4,75 %, Drilling ≈ 2,11 %). Geprüft wird nur die Größenordnung.
    expect((counts.get("two-pair") ?? 0) / 200_000).toBeCloseTo(0.0475, 2);
    expect((counts.get("three-of-a-kind") ?? 0) / 200_000).toBeCloseTo(0.0211, 2);
  }, 120_000);
});
