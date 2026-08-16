import { describe, expect, it } from "vitest";
import { buildPaytable, rtpOf, uniformPaytable } from "@/lib/paytable";
import { expectedValue, mulberry32, totalProbability } from "@/lib/rng";
import { roulettePaytables } from "@/data/paytables/roulette";
import {
  AMERICAN_WHEEL,
  betKindsFor,
  betRtp,
  COVERED_COUNT,
  cornerAnchors,
  coveredPockets,
  EUROPEAN_WHEEL,
  formatPocket,
  isValidSplit,
  PAYOUT_TO_ONE,
  pocketColor,
  pocketCount,
  RED_NUMBERS,
  resolveBet,
  splitPartners,
  spin,
  wheelFor,
  type BetKind,
  type Pocket,
  type RouletteBet,
  type RouletteVariant,
} from "./roulette-logic";

const VARIANTS: readonly RouletteVariant[] = ["european", "american"];

/** Alle konkreten Wetten einer Variante — nicht nur je ein Beispiel je Wettart. */
function allBets(variant: RouletteVariant): RouletteBet[] {
  const wheel = wheelFor(variant);
  const bets: RouletteBet[] = [];
  for (const p of wheel) bets.push({ kind: "straight", pocket: p });
  for (const a of wheel) for (const b of splitPartners(a, variant)) bets.push({ kind: "split", a, b });
  for (let row = 1; row <= 12; row++) bets.push({ kind: "street", row });
  for (const anchor of cornerAnchors()) bets.push({ kind: "corner", anchor });
  for (let row = 1; row <= 11; row++) bets.push({ kind: "sixline", row });
  for (const column of [1, 2, 3] as const) bets.push({ kind: "column", column });
  for (const dozen of [1, 2, 3] as const) bets.push({ kind: "dozen", dozen });
  bets.push({ kind: "red" }, { kind: "black" }, { kind: "even" }, { kind: "odd" }, { kind: "low" }, { kind: "high" });
  if (variant === "american") bets.push({ kind: "five" });
  return bets;
}

describe("Kesselordnung", () => {
  it("europäisch: 37 eindeutige Fächer, genau eine Null", () => {
    expect(EUROPEAN_WHEEL).toHaveLength(37);
    expect(new Set(EUROPEAN_WHEEL).size).toBe(37);
    expect(EUROPEAN_WHEEL.filter((p) => p === 0)).toHaveLength(1);
    expect(EUROPEAN_WHEEL).not.toContain("00");
    for (let n = 1; n <= 36; n++) expect(EUROPEAN_WHEEL).toContain(n);
  });

  it("amerikanisch: 38 eindeutige Fächer mit Null und Doppelnull", () => {
    expect(AMERICAN_WHEEL).toHaveLength(38);
    expect(new Set(AMERICAN_WHEEL).size).toBe(38);
    expect(AMERICAN_WHEEL).toContain(0);
    expect(AMERICAN_WHEEL).toContain("00");
    for (let n = 1; n <= 36; n++) expect(AMERICAN_WHEEL).toContain(n);
  });

  it("Farbverteilung: 18 rot, 18 schwarz, 1 bzw. 2 grün", () => {
    for (const variant of VARIANTS) {
      const wheel = wheelFor(variant);
      const count = (c: string) => wheel.filter((p) => pocketColor(p) === c).length;
      expect(count("red"), variant).toBe(18);
      expect(count("black"), variant).toBe(18);
      expect(count("green"), variant).toBe(variant === "american" ? 2 : 1);
    }
  });

  it("Rot/Schwarz folgt der Tableau-Regel (1–10 und 19–28: ungerade rot; 11–18 und 29–36: ungerade schwarz)", () => {
    for (let n = 1; n <= 36; n++) {
      const lowBlock = (n >= 1 && n <= 10) || (n >= 19 && n <= 28);
      const expected = lowBlock === (n % 2 === 1) ? "red" : "black";
      expect(pocketColor(n), `Zahl ${n}`).toBe(expected);
      expect(RED_NUMBERS.has(n)).toBe(expected === "red");
    }
    expect(pocketColor(0)).toBe("green");
    expect(pocketColor("00")).toBe("green");
  });

  it("Farben wechseln zwischen unmittelbar benachbarten Zahlen im Kessel", () => {
    for (const variant of VARIANTS) {
      const wheel = wheelFor(variant);
      for (let i = 0; i < wheel.length; i++) {
        const a = wheel[i]!;
        const b = wheel[(i + 1) % wheel.length]!;
        // Paare mit einem grünen Fach sind vom Wechsel ausgenommen.
        if (pocketColor(a) === "green" || pocketColor(b) === "green") continue;
        expect(pocketColor(a), `${variant}: ${formatPocket(a)}/${formatPocket(b)}`).not.toBe(pocketColor(b));
      }
    }
  });

  it("amerikanisch: die Nachbarn eines grünen Fachs haben dieselbe Farbe (2/28 und 1/27)", () => {
    for (let i = 0; i < AMERICAN_WHEEL.length; i++) {
      const p = AMERICAN_WHEEL[i]!;
      if (pocketColor(p) !== "green") continue;
      const before = AMERICAN_WHEEL[(i + AMERICAN_WHEEL.length - 1) % AMERICAN_WHEEL.length]!;
      const after = AMERICAN_WHEEL[(i + 1) % AMERICAN_WHEEL.length]!;
      expect(pocketColor(before), formatPocket(p)).toBe(pocketColor(after));
    }
  });

  it("amerikanisch: gegenüberliegende Fächer bilden aufeinanderfolgende Paare, 0 und 00 liegen sich gegenüber", () => {
    for (let i = 0; i < 19; i++) {
      const a = AMERICAN_WHEEL[i]!;
      const b = AMERICAN_WHEEL[i + 19]!;
      if (a === 0) {
        expect(b).toBe("00");
        continue;
      }
      expect(Math.abs(Number(a) - Number(b)), `${formatPocket(a)}/${formatPocket(b)}`).toBe(1);
    }
  });
});

describe("Wurf", () => {
  it("liefert immer ein Fach des Kessels", () => {
    for (const variant of VARIANTS) {
      const rng = mulberry32(4711);
      for (let i = 0; i < 10_000; i++) {
        const { pocket, wheelIndex } = spin((rng() * 0xffffffff) >>> 0, variant);
        expect(wheelFor(variant)).toContain(pocket);
        expect(wheelFor(variant)[wheelIndex]).toBe(pocket);
      }
    }
  });

  it("ist deterministisch über den Seed, aber nicht immer gleich", () => {
    for (const variant of VARIANTS) {
      for (const seed of [0, 1, 42, 987_654, 0xdeadbeef]) {
        expect(spin(seed, variant)).toEqual(spin(seed, variant));
      }
      const pockets = new Set<string>();
      for (let seed = 0; seed < 500; seed++) pockets.add(formatPocket(spin(seed, variant).pocket));
      expect(pockets.size, variant).toBeGreaterThan(20);
    }
  });

  it("trifft über viele Würfe jedes Fach", () => {
    for (const variant of VARIANTS) {
      const seen = new Set<string>();
      const rng = mulberry32(20260815);
      for (let i = 0; i < 200_000; i++) seen.add(formatPocket(spin((rng() * 0xffffffff) >>> 0, variant).pocket));
      expect(seen.size, variant).toBe(pocketCount(variant));
    }
  });
});

describe("Wettarten und Auszahlungen", () => {
  it("deckt die vereinbarte Zahl an Fächern ab", () => {
    for (const variant of VARIANTS) {
      for (const bet of allBets(variant)) {
        const covered = coveredPockets(bet);
        expect(covered.length, `${bet.kind}`).toBe(COVERED_COUNT[bet.kind]);
        expect(new Set(covered.map(formatPocket)).size).toBe(covered.length);
        for (const p of covered) expect(wheelFor(variant), `${bet.kind} deckt ${formatPocket(p)}`).toContain(p);
      }
    }
  });

  it("zahlt bei Treffer Einsatz × (x + 1) — Beispielrechnungen mit 100 Hundertsteln Einsatz", () => {
    const s = 100;
    // Plein 35:1 ⇒ 36× Einsatz
    expect(resolveBet({ kind: "straight", pocket: 17 }, 17, s)).toBe(3600);
    expect(resolveBet({ kind: "straight", pocket: 17 }, 18, s)).toBe(0);
    // Cheval 17:1 ⇒ 18×
    expect(resolveBet({ kind: "split", a: 1, b: 2 }, 2, s)).toBe(1800);
    expect(resolveBet({ kind: "split", a: 1, b: 2 }, 3, s)).toBe(0);
    // Transversale 11:1 ⇒ 12× (Reihe 4 = 10, 11, 12)
    expect(resolveBet({ kind: "street", row: 4 }, 11, s)).toBe(1200);
    expect(resolveBet({ kind: "street", row: 4 }, 13, s)).toBe(0);
    // Carré 8:1 ⇒ 9× (Anker 1 = 1, 2, 4, 5)
    expect(resolveBet({ kind: "corner", anchor: 1 }, 5, s)).toBe(900);
    expect(resolveBet({ kind: "corner", anchor: 1 }, 3, s)).toBe(0);
    // Sixain 5:1 ⇒ 6× (Reihen 1 und 2 = 1–6)
    expect(resolveBet({ kind: "sixline", row: 1 }, 6, s)).toBe(600);
    expect(resolveBet({ kind: "sixline", row: 1 }, 7, s)).toBe(0);
    // Kolonne und Dutzend 2:1 ⇒ 3×
    expect(resolveBet({ kind: "column", column: 2 }, 35, s)).toBe(300);
    expect(resolveBet({ kind: "column", column: 2 }, 34, s)).toBe(0);
    expect(resolveBet({ kind: "dozen", dozen: 3 }, 30, s)).toBe(300);
    expect(resolveBet({ kind: "dozen", dozen: 3 }, 24, s)).toBe(0);
    // Einfache Chancen 1:1 ⇒ 2×
    expect(resolveBet({ kind: "red" }, 3, s)).toBe(200);
    expect(resolveBet({ kind: "red" }, 4, s)).toBe(0);
    expect(resolveBet({ kind: "black" }, 4, s)).toBe(200);
    expect(resolveBet({ kind: "even" }, 12, s)).toBe(200);
    expect(resolveBet({ kind: "odd" }, 11, s)).toBe(200);
    expect(resolveBet({ kind: "low" }, 18, s)).toBe(200);
    expect(resolveBet({ kind: "low" }, 19, s)).toBe(0);
    expect(resolveBet({ kind: "high" }, 19, s)).toBe(200);
    // Five Number 6:1 ⇒ 7× (nur amerikanisch: 0, 00, 1, 2, 3)
    for (const p of [0, "00", 1, 2, 3] as Pocket[]) expect(resolveBet({ kind: "five" }, p, s)).toBe(700);
    expect(resolveBet({ kind: "five" }, 4, s)).toBe(0);
  });

  it("Null und Doppelnull verlieren alle Wetten außer Plein auf die Null und Five Number", () => {
    for (const variant of VARIANTS) {
      const zeros: Pocket[] = variant === "american" ? [0, "00"] : [0];
      for (const zero of zeros) {
        for (const bet of allBets(variant)) {
          const covers = coveredPockets(bet).some((p) => p === zero);
          const ret = resolveBet(bet, zero, 100);
          if (covers) expect(ret).toBeGreaterThan(0);
          else expect(ret, `${bet.kind} bei ${formatPocket(zero)}`).toBe(0);
        }
        expect(resolveBet({ kind: "even" }, zero, 100)).toBe(0);
        expect(resolveBet({ kind: "odd" }, zero, 100)).toBe(0);
        expect(resolveBet({ kind: "red" }, zero, 100)).toBe(0);
        expect(resolveBet({ kind: "black" }, zero, 100)).toBe(0);
        expect(resolveBet({ kind: "low" }, zero, 100)).toBe(0);
        expect(resolveBet({ kind: "high" }, zero, 100)).toBe(0);
      }
    }
  });

  it("kein Near Miss: Nachbarfächer im Kessel zahlen nichts (Regel 7)", () => {
    for (const variant of VARIANTS) {
      const wheel = wheelFor(variant);
      for (let i = 0; i < wheel.length; i++) {
        const target = wheel[i]!;
        const left = wheel[(i + wheel.length - 1) % wheel.length]!;
        const right = wheel[(i + 1) % wheel.length]!;
        expect(resolveBet({ kind: "straight", pocket: target }, left, 100)).toBe(0);
        expect(resolveBet({ kind: "straight", pocket: target }, right, 100)).toBe(0);
      }
    }
  });

  it("Cheval nur zwischen Zahlen, die auf dem Tableau aneinandergrenzen", () => {
    for (const variant of VARIANTS) {
      for (const a of wheelFor(variant)) {
        for (const b of splitPartners(a, variant)) {
          expect(isValidSplit(a, b, variant), `${formatPocket(a)}/${formatPocket(b)}`).toBe(true);
          // Nachbarschaft ist symmetrisch
          expect(isValidSplit(b, a, variant), `${formatPocket(b)}/${formatPocket(a)}`).toBe(true);
          expect(formatPocket(a)).not.toBe(formatPocket(b));
        }
      }
      expect(isValidSplit(1, 5, variant)).toBe(false); // diagonal, keine Kante
      expect(isValidSplit(3, 4, variant)).toBe(false); // Zeilenumbruch im Tableau
    }
  });

  it("Rückgaben sind ganzzahlig und nie negativ", () => {
    const rng = mulberry32(90210);
    for (const variant of VARIANTS) {
      const bets = allBets(variant);
      for (let i = 0; i < 20_000; i++) {
        const bet = bets[Math.floor(rng() * bets.length)]!;
        const stake = 10 + Math.floor(rng() * 4991); // 0,10 bis 50,00 Credits
        const { pocket } = spin((rng() * 0xffffffff) >>> 0, variant);
        const ret = resolveBet(bet, pocket, stake);
        expect(Number.isInteger(ret)).toBe(true);
        expect(ret).toBeGreaterThanOrEqual(0);
        expect(ret === 0 || ret === stake * (PAYOUT_TO_ONE[bet.kind] + 1)).toBe(true);
      }
    }
  });
});

describe("Auszahlungstabellen", () => {
  const tablesOf = (gameId: string) => roulettePaytables.filter((t) => t.gameId.startsWith(`${gameId}::`));

  it("es gibt je Wettart genau eine Tabelle mit Klartextnamen", () => {
    const expectations: [string, RouletteVariant][] = [
      ["g-european-roulette", "european"],
      ["g-american-roulette", "american"],
      ["g-live-roulette-demo", "european"],
    ];
    for (const [gameId, variant] of expectations) {
      const kinds = betKindsFor(variant);
      const tables = tablesOf(gameId);
      expect(tables, gameId).toHaveLength(kinds.length);
      for (const kind of kinds) {
        const table = tables.find((t) => t.gameId === `${gameId}::${kind}`);
        expect(table, `${gameId}::${kind} fehlt`).toBeDefined();
        expect(table!.label, `${gameId}::${kind} ohne Klartextnamen`).toBeTruthy();
      }
    }
  });

  it("jede Tabelle summiert auf 1 und entspricht uniformPaytable/buildPaytable", () => {
    for (const table of roulettePaytables) {
      expect(totalProbability(table), table.gameId).toBeCloseTo(1, 12);
      // buildPaytable wirft, wenn die Summe nicht exakt 1 ist oder ein Wert negativ wäre.
      expect(() => buildPaytable(table.gameId, table.entries)).not.toThrow();

      const kind = table.gameId.slice(table.gameId.indexOf("::") + 2) as BetKind;
      const variant: RouletteVariant = table.gameId.startsWith("g-american") ? "american" : "european";
      const reference = uniformPaytable(table.gameId, {
        total: pocketCount(variant),
        wins: COVERED_COUNT[kind],
        multiplier: PAYOUT_TO_ONE[kind] + 1,
        winLabel: table.entries[0]!.label,
        loseLabel: table.entries[1]!.label,
      });
      expect(table.entries, table.gameId).toEqual(reference.entries);
    }
  });

  it("Erwartungswerte: europäisch 36/37, amerikanisch 36/38, Five Number 35/38", () => {
    for (const table of tablesOf("g-european-roulette")) {
      expect(expectedValue(table), table.gameId).toBeCloseTo(36 / 37, 12);
    }
    // Live-Tisch nutzt dieselbe Logik wie European Roulette ⇒ identische Werte
    for (const table of tablesOf("g-live-roulette-demo")) {
      expect(expectedValue(table), table.gameId).toBeCloseTo(36 / 37, 12);
    }
    for (const table of tablesOf("g-american-roulette")) {
      const expected = table.gameId.endsWith("::five") ? 35 / 38 : 36 / 38;
      expect(expectedValue(table), table.gameId).toBeCloseTo(expected, 12);
    }
    // Die Five-Number-Wette liegt sachlich unter allen anderen Wetten desselben Kessels.
    expect(35 / 38).toBeLessThan(36 / 38);
    expect(rtpOf(roulettePaytables.find((t) => t.gameId === "g-american-roulette::five")!)).toBe(0.9211);
    expect(rtpOf(roulettePaytables.find((t) => t.gameId === "g-european-roulette::red")!)).toBe(0.973);
    expect(rtpOf(roulettePaytables.find((t) => t.gameId === "g-american-roulette::red")!)).toBe(0.9474);
  });

  it("betRtp der Logik stimmt mit dem Erwartungswert der Tabelle überein", () => {
    for (const table of roulettePaytables) {
      const kind = table.gameId.slice(table.gameId.indexOf("::") + 2) as BetKind;
      const variant: RouletteVariant = table.gameId.startsWith("g-american") ? "american" : "european";
      expect(betRtp(kind, variant), table.gameId).toBeCloseTo(expectedValue(table), 12);
    }
  });
});

describe("Rückgabequoten", () => {
  /**
   * Exakte Prüfung ALLER Wettarten: Der Kessel ist endlich, also wird jedes Fach genau einmal
   * ausgewertet (systematische Vollerhebung statt Stichprobe). Das trifft den Erwartungswert
   * ohne Zufallsrauschen und deckt jede konkrete Wette ab, nicht nur ein Beispiel je Wettart.
   */
  it("Vollerhebung über alle Fächer trifft betRtp exakt", () => {
    const stake = 100;
    for (const variant of VARIANTS) {
      const wheel = wheelFor(variant);
      for (const bet of allBets(variant)) {
        const returned = wheel.reduce<number>((sum, p) => sum + resolveBet(bet, p, stake), 0);
        expect(returned / (stake * wheel.length), `${variant}/${bet.kind}`).toBeCloseTo(betRtp(bet.kind, variant), 12);
      }
    }
  });

  /**
   * Zusätzlich die geforderte PRNG-Simulation über 5.000.000 Runden (Toleranz ±0,5 Prozentpunkte).
   * Bewusst nur für vier repräsentative Wetten statt für alle 40 Tabellen — die Vollerhebung oben
   * prüft die übrigen bereits exakt, und jede weitere Simulation kostet Laufzeit ohne neuen Befund.
   * Auswahl:
   *   - European Rot: einfache Chance, höchste Trefferquote, prüft den 37er-Kessel
   *   - European Plein: höchste Varianz aller Wetten (σ ≈ 5,8 ⇒ Standardfehler ≈ 0,26 pp bei 5 Mio.)
   *   - American Dutzend: mittlere Quote am 38er-Kessel
   *   - American Five Number: die einzige Wette mit abweichendem Erwartungswert (35/38)
   */
  it("PRNG-Simulation über 5.000.000 Runden je repräsentativer Wette (±0,5 pp)", () => {
    const cases: { variant: RouletteVariant; bet: RouletteBet; seed: number }[] = [
      { variant: "european", bet: { kind: "red" }, seed: 0xc0ffee },
      { variant: "european", bet: { kind: "straight", pocket: 17 }, seed: 0x5eed17 },
      { variant: "american", bet: { kind: "dozen", dozen: 2 }, seed: 0xbadc0de },
      { variant: "american", bet: { kind: "five" }, seed: 0x1234567 },
    ];
    const stake = 100;
    const rounds = 5_000_000;
    for (const { variant, bet, seed } of cases) {
      const rng = mulberry32(seed);
      let returned = 0;
      for (let i = 0; i < rounds; i++) {
        const { pocket } = spin((rng() * 0xffffffff) >>> 0, variant);
        returned += resolveBet(bet, pocket, stake);
      }
      const rtp = returned / (stake * rounds);
      const target = betRtp(bet.kind, variant);
      expect(Math.abs(rtp - target), `${variant}/${bet.kind}: ${rtp} vs ${target}`).toBeLessThanOrEqual(0.005);
    }
  }, 120_000);
});
