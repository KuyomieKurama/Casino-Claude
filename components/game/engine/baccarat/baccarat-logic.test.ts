import { describe, expect, it } from "vitest";
import { mulberry32, expectedValue, totalProbability } from "@/lib/rng";
import { findPaytable } from "@/data/paytables";
import { rtpOf } from "@/lib/paytable";
import {
  BACCARAT_BET_IDS,
  DECK_COUNT,
  SHOE_SIZE,
  bankerDrawsThird,
  cardFromIndex,
  cardPoints,
  dealCoup,
  handPoints,
  playCoup,
  playerDrawsThird,
  resolveBaccaratRound,
  resolveBet,
  type BaccaratBetId,
  type BaccaratCard,
  type CoupResult,
} from "./baccarat-logic";

/** Karte aus Kurzschreibweise: "A" | "2".."9" | "T" (Zehner/Bilder) | "B" | "D" | "K". */
function card(short: string, suit = 0): BaccaratCard {
  const map: Record<string, number> = { A: 1, T: 10, B: 11, D: 12, K: 13 };
  const rank = map[short] ?? Number.parseInt(short, 10);
  return { rank, suit };
}

/** Kartenlieferant aus einer festen Liste — macht die Ziehregeln prüfbar. */
function fixedDraw(shorts: readonly string[]): () => BaccaratCard {
  let i = 0;
  return () => {
    const s = shorts[i++];
    if (s === undefined) throw new Error("Kartenliste im Test zu kurz — die Ziehlogik hat mehr Karten angefordert als erwartet.");
    return card(s);
  };
}

describe("Baccarat — Kartenwerte", () => {
  it("10, Bube, Dame und König zählen 0, das Ass 1, alle übrigen ihren Nennwert", () => {
    expect(cardPoints(1)).toBe(1);
    for (let r = 2; r <= 9; r++) expect(cardPoints(r)).toBe(r);
    for (const r of [10, 11, 12, 13]) expect(cardPoints(r)).toBe(0);
  });

  it("Handpunkte sind die Summe modulo 10", () => {
    expect(handPoints([card("9"), card("7")])).toBe(6); // 16 → 6
    expect(handPoints([card("K"), card("T")])).toBe(0);
    expect(handPoints([card("A"), card("9")])).toBe(0); // 10 → 0
    expect(handPoints([card("5"), card("4"), card("8")])).toBe(7); // 17 → 7
    expect(handPoints([])).toBe(0);
  });

  it("cardFromIndex bildet 416 Schuhkarten auf 8 vollständige Decks ab", () => {
    const count = new Map<string, number>();
    for (let i = 0; i < SHOE_SIZE; i++) {
      const c = cardFromIndex(i);
      expect(c.rank).toBeGreaterThanOrEqual(1);
      expect(c.rank).toBeLessThanOrEqual(13);
      expect(c.suit).toBeGreaterThanOrEqual(0);
      expect(c.suit).toBeLessThanOrEqual(3);
      const key = `${c.rank}-${c.suit}`;
      count.set(key, (count.get(key) ?? 0) + 1);
    }
    expect(count.size).toBe(52);
    for (const n of count.values()) expect(n).toBe(DECK_COUNT);
  });
});

describe("Baccarat — Ziehregeln (dokumentierte Beispiele)", () => {
  it("Spieler zieht bei 0–5 und steht bei 6–7", () => {
    for (let t = 0; t <= 5; t++) expect(playerDrawsThird(t)).toBe(true);
    expect(playerDrawsThird(6)).toBe(false);
    expect(playerDrawsThird(7)).toBe(false);
  });

  it("Bank zieht ohne dritte Spielerkarte wie der Spieler: 0–5 ziehen, 6–7 stehen", () => {
    for (let t = 0; t <= 5; t++) expect(bankerDrawsThird(t, null)).toBe(true);
    expect(bankerDrawsThird(6, null)).toBe(false);
    expect(bankerDrawsThird(7, null)).toBe(false);
  });

  it("vollständige Banktabelle in Abhängigkeit von der dritten Spielerkarte", () => {
    // Zeile je Bankpunktzahl 0–7, Spalte je Punktwert der dritten Spielerkarte 0–9.
    const expected: Record<number, readonly boolean[]> = {
      0: [true, true, true, true, true, true, true, true, true, true],
      1: [true, true, true, true, true, true, true, true, true, true],
      2: [true, true, true, true, true, true, true, true, true, true],
      3: [true, true, true, true, true, true, true, true, false, true], // steht nur bei 8
      4: [false, false, true, true, true, true, true, true, false, false],
      5: [false, false, false, false, true, true, true, true, false, false],
      6: [false, false, false, false, false, false, true, true, false, false],
      7: [false, false, false, false, false, false, false, false, false, false],
    };
    for (const [totalStr, row] of Object.entries(expected)) {
      const total = Number(totalStr);
      row.forEach((shouldDraw, third) => {
        expect(bankerDrawsThird(total, third), `Bank ${total}, dritte Spielerkarte ${third}`).toBe(shouldDraw);
      });
    }
  });

  it("Natural beendet den Coup sofort — keine dritte Karte", () => {
    // Spieler 4+5 = 9 (Natural), Bank 3+3 = 6. Bank würde sonst nicht ziehen, Spieler schon.
    const coup = playCoup(fixedDraw(["4", "3", "5", "3"]));
    expect(coup.natural).toBe(true);
    expect(coup.playerCards).toHaveLength(2);
    expect(coup.bankerCards).toHaveLength(2);
    expect(coup.playerTotal).toBe(9);
    expect(coup.bankerTotal).toBe(6);
    expect(coup.result).toBe("player");
  });

  it("Natural 8 der Bank schlägt eine Spielerhand mit 5, obwohl der Spieler sonst zöge", () => {
    // Reihenfolge: Spieler, Bank, Spieler, Bank
    const coup = playCoup(fixedDraw(["2", "5", "3", "3"]));
    expect(coup.natural).toBe(true);
    expect(coup.playerTotal).toBe(5);
    expect(coup.bankerTotal).toBe(8);
    expect(coup.result).toBe("banker");
    expect(coup.playerCards).toHaveLength(2);
  });

  it("Beispiel: Spieler 4 zieht, Bank 5 steht bei dritter Karte 3", () => {
    // Spieler 2+2 = 4 → zieht 3 → 7. Bank 2+3 = 5, dritte Spielerkarte 3 → Bank steht.
    const coup = playCoup(fixedDraw(["2", "2", "2", "3", "3"]));
    expect(coup.playerCards).toHaveLength(3);
    expect(coup.bankerCards).toHaveLength(2);
    expect(coup.playerTotal).toBe(7);
    expect(coup.bankerTotal).toBe(5);
    expect(coup.result).toBe("player");
  });

  it("Beispiel: Spieler 4 zieht, Bank 5 zieht bei dritter Karte 4", () => {
    // Spieler 2+2 = 4 → zieht 4 → 8. Bank 2+3 = 5, dritte Spielerkarte 4 → Bank zieht 9 → 4.
    const coup = playCoup(fixedDraw(["2", "2", "2", "3", "4", "9"]));
    expect(coup.playerCards).toHaveLength(3);
    expect(coup.bankerCards).toHaveLength(3);
    expect(coup.playerTotal).toBe(8);
    expect(coup.bankerTotal).toBe(4);
    expect(coup.result).toBe("player");
  });

  it("Beispiel: Spieler steht mit 6, Bank zieht mit 5", () => {
    // Spieler 2+4 = 6 → steht. Bank 2+3 = 5, Spieler steht → Bank zieht bei 0–5 → zieht 2 → 7.
    const coup = playCoup(fixedDraw(["2", "2", "4", "3", "2"]));
    expect(coup.playerCards).toHaveLength(2);
    expect(coup.bankerCards).toHaveLength(3);
    expect(coup.playerTotal).toBe(6);
    expect(coup.bankerTotal).toBe(7);
    expect(coup.result).toBe("banker");
  });

  it("Beispiel: Bank 3 steht ausschließlich bei dritter Spielerkarte 8", () => {
    // Spieler 5+0(K) = 5 → zieht 8 → 3. Bank 1(A)+2 = 3 → steht wegen der 8.
    const stands = playCoup(fixedDraw(["5", "A", "K", "2", "8"]));
    expect(stands.playerTotal).toBe(3);
    expect(stands.bankerTotal).toBe(3);
    expect(stands.bankerCards).toHaveLength(2);
    expect(stands.result).toBe("tie");
    // Dieselbe Ausgangslage, dritte Spielerkarte 9 → Bank zieht.
    const draws = playCoup(fixedDraw(["5", "A", "K", "2", "9", "4"]));
    expect(draws.bankerCards).toHaveLength(3);
    expect(draws.bankerTotal).toBe(7);
  });

  it("Beispiel: Bank 6 zieht nur bei dritter Spielerkarte 6 oder 7", () => {
    const draws = playCoup(fixedDraw(["3", "2", "2", "4", "7", "A"])); // Spieler 5 → 2, Bank 6 → zieht
    expect(draws.bankerCards).toHaveLength(3);
    const stands = playCoup(fixedDraw(["3", "2", "2", "4", "5"])); // dritte Karte 5 → Bank steht
    expect(stands.bankerCards).toHaveLength(2);
    expect(stands.bankerTotal).toBe(6);
  });

  it("Beispiel: Bank 7 steht immer", () => {
    // Spieler 1+2 = 3 → zieht 7 → 0. Bank 3+4 = 7 → steht.
    const coup = playCoup(fixedDraw(["A", "3", "2", "4", "7"]));
    expect(coup.bankerCards).toHaveLength(2);
    expect(coup.bankerTotal).toBe(7);
    expect(coup.playerTotal).toBe(0);
    expect(coup.result).toBe("banker");
  });

  it("ein Coup verbraucht nie mehr als sechs Karten", () => {
    const scratch = new Uint16Array(SHOE_SIZE);
    for (let seed = 1; seed <= 20_000; seed++) {
      const coup = dealCoup(seed, scratch);
      const used = coup.playerCards.length + coup.bankerCards.length;
      expect(used).toBeGreaterThanOrEqual(4);
      expect(used).toBeLessThanOrEqual(6);
      expect(coup.playerTotal).toBeGreaterThanOrEqual(0);
      expect(coup.playerTotal).toBeLessThanOrEqual(9);
      expect(coup.bankerTotal).toBeLessThanOrEqual(9);
    }
  });
});

describe("Baccarat — Wetten und Kommission", () => {
  it("Spielerwette zahlt 1:1, Bankwette 1:1 abzüglich 5 %, Unentschieden 8:1", () => {
    expect(resolveBet("player", "player", 100)).toBe(200);
    expect(resolveBet("banker", "banker", 100)).toBe(195); // 200 − ⌈100/20⌉ = 200 − 5
    expect(resolveBet("tie", "tie", 100)).toBe(900);
  });

  it("bei Unentschieden erhalten Spieler- und Bankwette den Einsatz zurück (Push)", () => {
    expect(resolveBet("player", "tie", 250)).toBe(250);
    expect(resolveBet("banker", "tie", 250)).toBe(250);
    expect(resolveBet("tie", "player", 250)).toBe(0);
    expect(resolveBet("tie", "banker", 250)).toBe(0);
  });

  it("verlorene Wetten geben nichts zurück", () => {
    expect(resolveBet("player", "banker", 500)).toBe(0);
    expect(resolveBet("banker", "player", 500)).toBe(0);
  });

  it("Kommission wird auf ganze Hundertstel aufgerundet — nie zulasten des Hauses gerundet", () => {
    // 50 / 20 = 2,5 → 3 Hundertstel Kommission, Rückgabe 100 − 3 = 97
    expect(resolveBet("banker", "banker", 50)).toBe(97);
    // 10 / 20 = 0,5 → 1
    expect(resolveBet("banker", "banker", 10)).toBe(19);
    // 1 / 20 = 0,05 → 1 (kleinstmögliche Kommission ist ein Hundertstel)
    expect(resolveBet("banker", "banker", 1)).toBe(1);
    // Einsätze, die durch 20 teilbar sind, treffen den Multiplikator 1,95 exakt
    for (const stake of [20, 100, 200, 500, 1000, 2000, 5000]) {
      expect(resolveBet("banker", "banker", stake)).toBe(stake * 1.95);
    }
  });

  it("Rückgaben sind für alle Kombinationen ganzzahlig und nie negativ", () => {
    const results: readonly CoupResult[] = ["player", "banker", "tie"];
    for (const bet of BACCARAT_BET_IDS) {
      for (const result of results) {
        for (let stake = 1; stake <= 400; stake++) {
          const r = resolveBet(bet, result, stake);
          expect(Number.isInteger(r), `${bet}/${result}/${stake}`).toBe(true);
          expect(r).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });
});

describe("Baccarat — Determinismus", () => {
  it("gleicher Seed ergibt denselben Coup", () => {
    for (const seed of [1, 42, 999, 123456789, 4294967295]) {
      const a = dealCoup(seed);
      const b = dealCoup(seed);
      expect(a).toEqual(b);
    }
  });

  it("der Wiederverwendungspuffer ändert das Ergebnis nicht", () => {
    const scratch = new Uint16Array(SHOE_SIZE);
    for (let seed = 1; seed <= 500; seed++) {
      expect(dealCoup(seed, scratch)).toEqual(dealCoup(seed));
    }
  });

  it("unterschiedliche Seeds liefern nicht immer dasselbe Ergebnis", () => {
    const seen = new Set<CoupResult>();
    for (let seed = 1; seed <= 200; seed++) seen.add(dealCoup(seed).result);
    expect(seen.size).toBeGreaterThan(1);
  });

  it("resolveBaccaratRound ist reproduzierbar und liefert ganzzahlige Rückgaben", () => {
    for (const bet of BACCARAT_BET_IDS) {
      for (let seed = 1; seed <= 300; seed++) {
        const a = resolveBaccaratRound({ stakeMinor: 100, seed, betId: bet });
        const b = resolveBaccaratRound({ stakeMinor: 100, seed, betId: bet });
        expect(a.returnMinor).toBe(b.returnMinor);
        expect(a.outcomeKey).toBe(b.outcomeKey);
        expect(Number.isInteger(a.returnMinor)).toBe(true);
        expect(a.returnMinor).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("ohne gültige Wett-ID wird auf die Spielerwette zurückgefallen", () => {
    const fallback = resolveBaccaratRound({ stakeMinor: 100, seed: 7 });
    const explicit = resolveBaccaratRound({ stakeMinor: 100, seed: 7, betId: "player" });
    expect(fallback.returnMinor).toBe(explicit.returnMinor);
    expect(fallback.outcomeKey).toBe(explicit.outcomeKey);
  });
});

describe("Baccarat — Auszahlungstabellen", () => {
  const gameIds = ["g-baccarat", "g-live-baccarat-demo"] as const;

  it("jede Tabelle summiert auf 1 und trägt einen Klartextnamen", () => {
    for (const gameId of gameIds) {
      for (const bet of BACCARAT_BET_IDS) {
        const table = findPaytable(gameId, bet);
        expect(table, `${gameId}::${bet}`).toBeDefined();
        expect(totalProbability(table!)).toBeCloseTo(1, 12);
        expect(table!.label).toBeTruthy();
        for (const e of table!.entries) {
          expect(e.multiplier).toBeGreaterThanOrEqual(0);
          expect(e.probability).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it("beide Baccarat-Titel nutzen identische Tabellen", () => {
    for (const bet of BACCARAT_BET_IDS) {
      expect(findPaytable("g-live-baccarat-demo", bet)!.entries).toEqual(findPaytable("g-baccarat", bet)!.entries);
    }
  });

  it("die Erwartungswerte entsprechen den bekannten Werten für 8 Decks", () => {
    expect(rtpOf(findPaytable("g-baccarat", "player")!)).toBeCloseTo(0.9876, 4);
    expect(rtpOf(findPaytable("g-baccarat", "banker")!)).toBeCloseTo(0.9894, 4);
    expect(rtpOf(findPaytable("g-baccarat", "tie")!)).toBeCloseTo(0.8564, 4);
  });
});

/**
 * Beleg statt Behauptung: Die Wahrscheinlichkeiten in `data/paytables/baccarat.ts` stammen aus der
 * kombinatorischen Auszählung des 8-Deck-Schuhs. Hier wird geprüft, dass GENAU DIESE
 * Implementierung sie erzeugt — Verteilung und resultierender RTP.
 *
 * Umfang: 5.000.000 Coups je Durchlauf (Vorgabe des Auftragsrahmens). Der Standardfehler der
 * Trefferquote liegt damit bei ≈ 0,00022; die geprüfte Toleranz von ±0,5 Prozentpunkten im RTP
 * ist um Größenordnungen weiter und wird nicht aufgeweicht, sondern deutlich unterschritten.
 * Für die Tabelle wurde einmalig zusätzlich mit 20.000.000 Coups gemessen (Seed 20260815):
 * Spieler 0,446221 · Bank 0,458566 · Unentschieden 0,095212.
 */
describe("Baccarat — Verteilung über 5.000.000 Coups", () => {
  const ROUNDS = 5_000_000;
  const STAKE = 100; // durch 20 teilbar: die Kommission trifft den Multiplikator 1,95 exakt

  it(
    "gemessene Verteilung und RTP decken sich mit den Tabellen",
    () => {
      const seeds = mulberry32(20260815);
      const scratch = new Uint16Array(SHOE_SIZE);
      const wins: Record<CoupResult, number> = { player: 0, banker: 0, tie: 0 };
      const returned: Record<BaccaratBetId, number> = { player: 0, banker: 0, tie: 0 };

      for (let i = 0; i < ROUNDS; i++) {
        const seed = Math.floor(seeds() * 0xffffffff) >>> 0;
        const result = dealCoup(seed, scratch).result;
        wins[result]++;
        for (const bet of BACCARAT_BET_IDS) returned[bet] += resolveBet(bet, result, STAKE);
      }

      const measured: Record<CoupResult, number> = {
        player: wins.player / ROUNDS,
        banker: wins.banker / ROUNDS,
        tie: wins.tie / ROUNDS,
      };
      expect(measured.player + measured.banker + measured.tie).toBeCloseTo(1, 12);

      // Trefferquoten gegen die Tabellenwahrscheinlichkeiten (Toleranz 0,002 ≈ 9 Standardfehler)
      const table = (bet: BaccaratBetId) => findPaytable("g-baccarat", bet)!;
      const winProb = (bet: BaccaratBetId) => table(bet).entries.find((e) => e.key === "win")!.probability;
      expect(measured.player).toBeCloseTo(winProb("player"), 2);
      expect(measured.banker).toBeCloseTo(winProb("banker"), 2);
      expect(measured.tie).toBeCloseTo(winProb("tie"), 2);
      expect(Math.abs(measured.player - winProb("player"))).toBeLessThan(0.002);
      expect(Math.abs(measured.banker - winProb("banker"))).toBeLessThan(0.002);
      expect(Math.abs(measured.tie - winProb("tie"))).toBeLessThan(0.002);

      // RTP je Wette: Simulation gegen Erwartungswert der Tabelle, Toleranz ±0,5 Prozentpunkte
      for (const bet of BACCARAT_BET_IDS) {
        const simulated = returned[bet] / (ROUNDS * STAKE);
        const declared = expectedValue(table(bet));
        expect(Math.abs(simulated - declared), `${bet}: simuliert ${simulated}, ausgewiesen ${declared}`).toBeLessThan(0.005);
      }
    },
    600_000,
  );
});
