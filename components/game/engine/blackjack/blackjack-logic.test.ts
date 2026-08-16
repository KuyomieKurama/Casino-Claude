import { describe, expect, it } from "vitest";
import { mulberry32 } from "@/lib/rng";
import {
  applyAction,
  availableActions,
  beginRound,
  createShoe,
  dealerPlay,
  handValue,
  isBlackjack,
  isBust,
  maxReturnFor,
  roundSettlement,
  settleHand,
  RANKS,
  SHOE_SIZE,
  SUITS,
  type BlackjackAction,
  type Card,
  type Rank,
  type RoundState,
  type Suit,
} from "./blackjack-logic";

/** Kurzschreibweise: c("A") = Ass Pik, c("10", "hearts") = Herz-Zehn. */
const c = (rank: Rank, suit: Suit = "spades"): Card => ({ rank, suit });

describe("Kartenwerte", () => {
  it("zählt harte Hände als Summe der Kartenwerte", () => {
    expect(handValue([c("10"), c("7")])).toEqual({ total: 17, soft: false });
    expect(handValue([c("K"), c("9")])).toEqual({ total: 19, soft: false });
    expect(handValue([c("2"), c("3"), c("4")])).toEqual({ total: 9, soft: false });
    expect(handValue([c("J"), c("Q"), c("K")])).toEqual({ total: 30, soft: false });
  });

  it("zählt Bildkarten als 10", () => {
    for (const rank of ["10", "J", "Q", "K"] as const) {
      expect(handValue([c(rank)]).total).toBe(10);
    }
  });

  it("zählt ein Ass als 11, solange die Hand nicht über 21 geht (weiche Hand)", () => {
    expect(handValue([c("A"), c("6")])).toEqual({ total: 17, soft: true });
    expect(handValue([c("A"), c("5")])).toEqual({ total: 16, soft: true });
    expect(handValue([c("A"), c("9")])).toEqual({ total: 20, soft: true });
  });

  it("zählt ein Ass als 1, sobald 11 die Hand überkaufen würde (harte Hand)", () => {
    expect(handValue([c("A"), c("6"), c("K")])).toEqual({ total: 17, soft: false });
    expect(handValue([c("A"), c("10"), c("5")])).toEqual({ total: 16, soft: false });
  });

  it("behandelt mehrere Asse korrekt: höchstens eines zählt 11", () => {
    expect(handValue([c("A"), c("A")])).toEqual({ total: 12, soft: true });
    expect(handValue([c("A"), c("A"), c("A")])).toEqual({ total: 13, soft: true });
    expect(handValue([c("A"), c("A"), c("9")])).toEqual({ total: 21, soft: true });
    expect(handValue([c("A"), c("A"), c("9"), c("K")])).toEqual({ total: 21, soft: false });
    expect(handValue([c("A"), c("A"), c("A"), c("A"), c("8")])).toEqual({ total: 12, soft: false });
  });

  it("erkennt Blackjack nur bei genau zwei Karten mit Wert 21", () => {
    expect(isBlackjack([c("A"), c("K")])).toBe(true);
    expect(isBlackjack([c("10", "hearts"), c("A", "clubs")])).toBe(true);
    expect(isBlackjack([c("7"), c("7"), c("7")])).toBe(false);
    expect(isBlackjack([c("A"), c("5"), c("5")])).toBe(false);
    expect(isBlackjack([c("A"), c("9")])).toBe(false);
  });

  it("erkennt überkaufte Hände", () => {
    expect(isBust([c("K"), c("Q"), c("2")])).toBe(true);
    expect(isBust([c("K"), c("Q")])).toBe(false);
    expect(isBust([c("A"), c("K"), c("Q")])).toBe(false);
  });
});

describe("Dealer-Regel: zieht bis 17, steht bei Soft 17", () => {
  it("zieht, bis mindestens 17 erreicht ist", () => {
    // 2+3 = 5 → zieht 10 (15) → zieht 2 (17) → steht
    const shoe = [c("10"), c("2"), c("9")];
    const played = dealerPlay([c("2"), c("3")], shoe, 0);
    expect(handValue(played.cards).total).toBe(17);
    expect(played.cards).toHaveLength(4);
    expect(played.drawIndex).toBe(2);
  });

  it("steht bei Soft 17 (Ass + Sechs) und zieht keine Karte", () => {
    const shoe = [c("5")];
    const played = dealerPlay([c("A"), c("6")], shoe, 0);
    expect(handValue(played.cards)).toEqual({ total: 17, soft: true });
    expect(played.cards).toHaveLength(2);
    expect(played.drawIndex).toBe(0);
  });

  it("steht auch bei Soft 17 aus drei Karten", () => {
    const played = dealerPlay([c("A"), c("3"), c("3")], [c("K")], 0);
    expect(handValue(played.cards)).toEqual({ total: 17, soft: true });
    expect(played.drawIndex).toBe(0);
  });

  it("zieht bei Soft 16 weiter", () => {
    // A+5 = weich 16 → zieht 9 → weich 15 wird hart 15? A(11)+5+9 = 25 → Ass zählt 1 → 15 → zieht 4 → 19
    const played = dealerPlay([c("A"), c("5")], [c("9"), c("4")], 0);
    expect(handValue(played.cards).total).toBe(19);
    expect(played.drawIndex).toBe(2);
  });

  it("steht sofort bei hart 17 und höher", () => {
    for (const hand of [[c("10"), c("7")], [c("K"), c("9")], [c("K"), c("A")]]) {
      const played = dealerPlay(hand, [c("2")], 0);
      expect(played.cards).toHaveLength(2);
      expect(played.drawIndex).toBe(0);
    }
  });

  it("zieht bei hart 16 und kann überkaufen", () => {
    const played = dealerPlay([c("10"), c("6")], [c("K")], 0);
    expect(handValue(played.cards).total).toBe(26);
    expect(isBust(played.cards)).toBe(true);
  });
});

describe("Auszahlungen (Beträge in Hundertsteln, immer ganzzahlig)", () => {
  const bet = 5000; // 50,00 Credits

  it("Blackjack zahlt 3:2 — Rückgabe 12500 bei Einsatz 5000", () => {
    const r = settleHand([c("A"), c("K")], [c("10"), c("7")], bet);
    expect(r.kind).toBe("blackjack");
    expect(r.grossMinor).toBe(12_500);
  });

  it("Blackjack rundet bei ungeradem Einsatz ab und bleibt ganzzahlig", () => {
    const r = settleHand([c("A"), c("Q")], [c("9"), c("8")], 25);
    // 25 + floor(25 * 3 / 2) = 25 + 37 = 62
    expect(r.grossMinor).toBe(62);
    expect(Number.isInteger(r.grossMinor)).toBe(true);
  });

  it("gewöhnlicher Gewinn zahlt 1:1 — Rückgabe 10000 bei Einsatz 5000", () => {
    const r = settleHand([c("10"), c("9")], [c("10"), c("8")], bet);
    expect(r.kind).toBe("win");
    expect(r.grossMinor).toBe(10_000);
  });

  it("Gewinn, wenn der Dealer überkauft", () => {
    const r = settleHand([c("10"), c("5")], [c("10"), c("6"), c("K")], bet);
    expect(r.kind).toBe("win");
    expect(r.grossMinor).toBe(10_000);
  });

  it("Push gibt genau den Einsatz zurück", () => {
    const r = settleHand([c("10"), c("9")], [c("K"), c("9")], bet);
    expect(r.kind).toBe("push");
    expect(r.grossMinor).toBe(bet);
  });

  it("Blackjack gegen Blackjack ist ein Push", () => {
    const r = settleHand([c("A"), c("K")], [c("A"), c("Q")], bet);
    expect(r.kind).toBe("push");
    expect(r.grossMinor).toBe(bet);
  });

  it("Verlust gegen die höhere Dealerhand zahlt nichts", () => {
    const r = settleHand([c("10"), c("7")], [c("10"), c("9")], bet);
    expect(r.kind).toBe("lose");
    expect(r.grossMinor).toBe(0);
  });

  it("Dealer-Blackjack schlägt eine gewöhnliche 21", () => {
    const r = settleHand([c("7"), c("7"), c("7")], [c("A"), c("K")], bet);
    expect(r.kind).toBe("dealer-blackjack");
    expect(r.grossMinor).toBe(0);
  });

  it("Überkaufen verliert immer — auch wenn der Dealer ebenfalls überkauft", () => {
    const r = settleHand([c("10"), c("8"), c("9")], [c("10"), c("6"), c("K")], bet);
    expect(r.kind).toBe("bust");
    expect(r.grossMinor).toBe(0);
  });

  it("21 aus zwei Karten nach Split oder Double zählt nicht als Blackjack", () => {
    const r = settleHand([c("A"), c("K")], [c("10"), c("7")], bet, { naturalEligible: false });
    expect(r.kind).toBe("win");
    expect(r.grossMinor).toBe(10_000);
  });
});

describe("Kartenschlitten", () => {
  it("enthält 6 × 52 = 312 Karten", () => {
    expect(SHOE_SIZE).toBe(312);
    expect(createShoe(1)).toHaveLength(312);
  });

  it("enthält nach dem Mischen dieselbe Multimenge (je Rang und Farbe genau 6 Karten)", () => {
    const counts = new Map<string, number>();
    for (const card of createShoe(4711)) {
      const key = `${card.rank}${card.suit}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    expect(counts.size).toBe(RANKS.length * SUITS.length);
    for (const rank of RANKS) {
      for (const suit of SUITS) {
        expect(counts.get(`${rank}${suit}`), `${rank}/${suit}`).toBe(6);
      }
    }
  });

  it("ist deterministisch: gleicher Seed ⇒ identische Reihenfolge", () => {
    expect(createShoe(12345)).toEqual(createShoe(12345));
    expect(createShoe(0)).toEqual(createShoe(0));
  });

  it("liefert bei unterschiedlichen Seeds unterschiedliche Reihenfolgen", () => {
    const a = createShoe(1);
    const b = createShoe(2);
    expect(a).not.toEqual(b);
    // Stichprobe über viele Seeds: die ersten vier Karten sind nicht durchgehend gleich
    const firstFour = new Set<string>();
    for (let seed = 0; seed < 500; seed++) {
      firstFour.add(createShoe(seed).slice(0, 4).map((k) => `${k.rank}${k.suit}`).join("|"));
    }
    expect(firstFour.size).toBeGreaterThan(400);
  });

  it("gleicher Seed ⇒ gleiche Runde, unterschiedliche Seeds ⇒ nicht immer gleich", () => {
    expect(beginRound(999, 1000).hands[0]!.cards).toEqual(beginRound(999, 1000).hands[0]!.cards);
    const totals = new Set<number>();
    for (let seed = 0; seed < 300; seed++) totals.add(handValue(beginRound(seed, 1000).hands[0]!.cards).total);
    expect(totals.size).toBeGreaterThan(5);
  });
});

describe("Aktionen", () => {
  /** Sucht einen Seed, dessen Startbild die gesuchte Bedingung erfüllt. */
  function findRound(predicate: (state: RoundState) => boolean, betMinor = 1000): RoundState {
    for (let seed = 1; seed < 200_000; seed++) {
      const state = beginRound(seed, betMinor);
      if (predicate(state)) return state;
    }
    throw new Error("Kein passender Seed gefunden.");
  }

  it("bietet Verdoppeln nur mit genau zwei Karten an", () => {
    const state = findRound((s) => s.phase === "player");
    expect(availableActions(state)).toContain("double");
    const afterHit = applyAction(state, "hit");
    if (afterHit.phase === "player") expect(availableActions(afterHit)).not.toContain("double");
  });

  it("bietet Teilen nur bei gleichem Rang an", () => {
    const pair = findRound((s) => s.phase === "player" && s.hands[0]!.cards[0]!.rank === s.hands[0]!.cards[1]!.rank);
    expect(availableActions(pair)).toContain("split");
    const noPair = findRound((s) => s.phase === "player" && s.hands[0]!.cards[0]!.rank !== s.hands[0]!.cards[1]!.rank);
    expect(availableActions(noPair)).not.toContain("split");
  });

  it("Verdoppeln zieht genau eine Karte, verdoppelt den Handeinsatz und beendet die Hand", () => {
    const state = findRound((s) => s.phase === "player");
    const after = applyAction(state, "double");
    const hand = after.hands[0]!;
    expect(hand.cards).toHaveLength(3);
    expect(hand.betMinor).toBe(2000);
    expect(hand.doubled).toBe(true);
    expect(after.phase).toBe("done");
  });

  it("Teilen erzeugt zwei Hände mit je zwei Karten und je einem Grundeinsatz", () => {
    const pair = findRound(
      (s) => s.phase === "player" && s.hands[0]!.cards[0]!.rank === s.hands[0]!.cards[1]!.rank && s.hands[0]!.cards[0]!.rank !== "A",
    );
    const after = applyAction(pair, "split");
    expect(after.hands).toHaveLength(2);
    for (const hand of after.hands) {
      expect(hand.cards).toHaveLength(2);
      expect(hand.betMinor).toBe(1000);
      expect(hand.fromSplit).toBe(true);
    }
    // Ein zweiter Split ist nicht vorgesehen
    expect(availableActions(after)).not.toContain("split");
  });

  it("geteilte Asse erhalten genau eine Karte und stehen dann", () => {
    const aces = findRound((s) => s.phase === "player" && s.hands[0]!.cards[0]!.rank === "A" && s.hands[0]!.cards[1]!.rank === "A");
    const after = applyAction(aces, "split");
    expect(after.phase).toBe("done");
    for (const hand of after.hands) {
      expect(hand.cards).toHaveLength(2);
      expect(hand.done).toBe(true);
    }
  });

  it("Blackjack beim Austeilen beendet die Runde sofort und zahlt 3:2", () => {
    const natural = findRound((s) => isBlackjack(s.hands[0]!.cards) && !isBlackjack(s.dealer));
    expect(natural.phase).toBe("done");
    expect(availableActions(natural)).toEqual([]);
    const settlement = roundSettlement(natural);
    expect(settlement.outcomeKey).toBe("blackjack");
    expect(settlement.returnMinor).toBe(2500);
    expect(settlement.totalBetMinor).toBe(1000);
  });

  it("Stehen beendet die Hand und lässt den Dealer ausspielen", () => {
    const state = findRound((s) => s.phase === "player");
    const after = applyAction(state, "stand");
    expect(after.phase).toBe("done");
    expect(handValue(after.dealer).total).toBeGreaterThanOrEqual(17);
  });

  it("lehnt unzulässige Aktionen ab", () => {
    const state = findRound((s) => s.phase === "player" && !availableActions(s).includes("split"));
    expect(() => applyAction(state, "split")).toThrow();
    const done = applyAction(state, "stand");
    expect(() => applyAction(done, "hit")).toThrow();
  });
});

describe("Rundenabrechnung und deklarierte Obergrenze", () => {
  /** Spielt eine Runde mit zufälligen, aber stets regelkonformen Entscheidungen zu Ende. */
  function playRandomRound(seed: number, betMinor: number, pick: () => number) {
    let state = beginRound(seed, betMinor);
    let guard = 0;
    while (state.phase === "player") {
      const actions: BlackjackAction[] = availableActions(state);
      const action = actions[Math.floor(pick() * actions.length)] ?? "stand";
      state = applyAction(state, action);
      guard += 1;
      if (guard > 60) throw new Error("Runde terminiert nicht.");
    }
    return { state, settlement: roundSettlement(state) };
  }

  it("gibt bei erhöhtem Einsatz die volle Bruttoauszahlung zurück (Zusatzeinsatz ist regulär gebucht)", () => {
    for (let seed = 1; seed < 5000; seed++) {
      const start = beginRound(seed, 1000);
      if (start.phase !== "player") continue;
      const after = applyAction(start, "double");
      const s = roundSettlement(after);
      expect(s.totalBetMinor).toBe(2000);
      expect(s.extraBetMinor).toBe(1000);
      // Der Zusatzeinsatz wurde vom Wallet abgebucht und wird nicht noch einmal gegengerechnet.
      expect(s.returnMinor).toBe(s.grossReturnMinor);
      return;
    }
    throw new Error("Kein Seed mit möglichem Verdoppeln gefunden.");
  });

  /**
   * Prüft die deklarierte Obergrenze über einen Seed-Bereich. Aufgeteilt auf zwei Tests
   * (zusammen 200.000 Runden), damit jeder Lauf deutlich unter dem Vitest-Zeitlimit bleibt.
   */
  function checkCap(fromSeed: number, toSeed: number, pickSeed: number) {
    const bets = [50, 100, 25, 5000, 10_000];
    const pick = mulberry32(pickSeed);
    let maxRatio = 0;
    let doubles = 0;
    let splits = 0;
    for (let seed = fromSeed; seed <= toSeed; seed++) {
      const betMinor = bets[seed % bets.length]!;
      const { state, settlement } = playRandomRound(seed, betMinor, pick);
      // Der Reducer zieht die beim Start deklarierte Obergrenze bei jeder Erhöhung im selben
      // Verhältnis mit; wirksam ist am Ende also maxReturnFor(Gesamteinsatz).
      const cap = maxReturnFor(settlement.totalBetMinor);
      expect(Number.isInteger(settlement.returnMinor)).toBe(true);
      expect(settlement.returnMinor).toBeGreaterThanOrEqual(0);
      expect(settlement.returnMinor, `Seed ${seed}, Einsatz ${betMinor}`).toBeLessThanOrEqual(cap);
      // Zusätzlich die scharfe Schranke: keine Runde zahlt mehr als das Doppelte des Gesamteinsatzes,
      // außer beim Blackjack ohne Erhöhung (2,5 × Grundeinsatz).
      expect(settlement.returnMinor).toBeLessThanOrEqual(Math.ceil(settlement.totalBetMinor * 2.5));
      maxRatio = Math.max(maxRatio, settlement.returnMinor / settlement.totalBetMinor);
      if (state.hands.some((h) => h.doubled)) doubles += 1;
      if (state.hands.length > 1) splits += 1;
    }
    // Die Stichprobe muss Verdoppeln und Teilen tatsächlich enthalten, sonst prüft sie zu wenig.
    expect(doubles).toBeGreaterThan(1000);
    expect(splits).toBeGreaterThan(1000);
    expect(maxRatio).toBeLessThanOrEqual(2.5);
  }

  it("hält die Obergrenze über 100.000 Runden ein (Seeds 1 bis 100.000)", () => {
    checkCap(1, 100_000, 0xbeef);
  });

  it("hält die Obergrenze über weitere 100.000 Runden ein (Seeds 100.001 bis 200.000)", () => {
    checkCap(100_001, 200_000, 0xc0ffee);
  });

  it("liefert bei jeder Runde ganzzahlige, nie negative Beträge", () => {
    const pick = mulberry32(7);
    for (let seed = 1; seed <= 20_000; seed++) {
      const { settlement } = playRandomRound(seed, 100, pick);
      expect(Number.isInteger(settlement.grossReturnMinor)).toBe(true);
      expect(settlement.grossReturnMinor).toBeGreaterThanOrEqual(0);
      expect(settlement.totalBetMinor).toBeGreaterThanOrEqual(100);
      for (const r of settlement.results) {
        expect(Number.isInteger(r.grossMinor)).toBe(true);
        expect(r.grossMinor).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("der deklarierte Rahmen ist 5 × Einsatz und liegt über jeder erreichbaren Auszahlung", () => {
    expect(maxReturnFor(100)).toBe(500);
    expect(maxReturnFor(5000)).toBe(25_000);
    // Gesamteinsatz höchstens 4E (Teilen plus Verdoppeln beider Hände), Brutto höchstens 2 × Gesamteinsatz
    expect(2 * 4 * 100).toBeLessThanOrEqual(maxReturnFor(4 * 100));
    // Blackjack ohne Erhöhung: 2,5 × Grundeinsatz
    expect(Math.ceil(2.5 * 100)).toBeLessThanOrEqual(maxReturnFor(100));
  });
});
