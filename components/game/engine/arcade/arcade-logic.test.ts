import { describe, expect, it } from "vitest";
import { mulberry32 } from "@/lib/rng";
import { expectedValue, totalProbability } from "@/lib/rng";
import { findPaytable } from "@/data/paytables";
import {
  DICE_BETS,
  DICE_MAX_ROLL,
  DICE_MIN_ROLL,
  PLINKO_BINOMIALS,
  PLINKO_BUCKET_COUNT,
  PLINKO_ROWS,
  PLINKO_TOTAL_PATHS,
  WHEEL_SEGMENTS,
  WHEEL_SEGMENT_COUNT,
  arcadePaytables,
  binomialRow,
  dicePaytables,
  plinkoBucketProbability,
  plinkoMultiplier,
  plinkoPaytable,
  wheelPaytable,
} from "@/data/paytables/arcade";
import {
  parsePlinkoDetail,
  plinkoBucketOf,
  plinkoHighlight,
  plinkoPath,
  plinkoPositions,
  resolvePlinko,
  resolvePlinkoRound,
} from "./plinko-logic";
import { isDiceWin, resolveDice, resolveDiceRound, rollDice } from "./dice-logic";
import { resolveWheel, resolveWheelRound, spinWheel, wheelHighlight } from "./wheel-logic";
import {
  MINES_CELLS,
  MINES_COUNTS,
  minePositions,
  minesLadder,
  minesMaxReturnMinor,
  minesMultiplier,
  minesReturnMinor,
  minesSafeProbability,
  startMinesRound,
  type MinesCount,
} from "./mines-logic";

/**
 * Tests der Arcade- und Game-Show-Engines.
 *
 * Die RTP-Prüfung läuft über 5.000.000 Runden je Tabelle mit FESTEN Seeds — das Ergebnis ist
 * damit reproduzierbar und der Test kann nicht sporadisch umkippen.
 */

const SIM_ROUNDS = 5_000_000;
const STAKE = 100;

/** Seedfolge wie zur Laufzeit: ein Master-PRNG erzeugt die Rundenseeds. */
function seedStream(master: number): () => number {
  const rng = mulberry32(master);
  return () => Math.floor(rng() * 0xffffffff) >>> 0;
}

/** Sammelt fehlgeschlagene Seeds, statt in der Schleife zu assertieren (Laufzeit). */
function collectProblems(seeds: number, ok: (seed: number) => boolean): number[] {
  const problems: number[] = [];
  for (let seed = 1; seed <= seeds; seed++) if (!ok(seed)) problems.push(seed);
  return problems;
}

describe("Auszahlungstabellen der Arcade-Engines", () => {
  it("jede Tabelle summiert EXAKT auf 1 (ohne Toleranz)", () => {
    expect(arcadePaytables.length).toBe(1 + 1 + DICE_BETS.length);
    for (const table of arcadePaytables) {
      const sum = table.entries.reduce((acc, e) => acc + e.probability, 0);
      expect(sum, `${table.gameId}: ${sum}`).toBe(1);
      expect(totalProbability(table)).toBe(1);
      for (const e of table.entries) {
        expect(e.probability, `${table.gameId}/${e.key}`).toBeGreaterThan(0);
        expect(e.multiplier, `${table.gameId}/${e.key}`).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("die Tabellen sind über data/paytables auffindbar", () => {
    expect(findPaytable("g-plinko-demo")).toBeDefined();
    expect(findPaytable("g-wheel-demo")).toBeDefined();
    expect(findPaytable("g-dice-demo", "over-50")).toBeDefined();
    // Mines hat bewusst keine Tabelle (Regel 6: kein RTP ohne Grundlage).
    expect(findPaytable("g-mines-demo")).toBeUndefined();
  });

  it(
    "RTP-Simulation über 5.000.000 Runden je Tabelle, Toleranz ±0,5 Prozentpunkte",
    () => {
      // Plinko: über den echten Kugelweg, nicht über pickOutcome — geprüft wird die Engine.
      {
        const nextSeed = seedStream(0x9e3779b9);
        let returned = 0;
        for (let i = 0; i < SIM_ROUNDS; i++) returned += resolvePlinkoRound(STAKE, nextSeed()).returnMinor;
        const rtp = returned / (STAKE * SIM_ROUNDS);
        expect(Math.abs(rtp - expectedValue(plinkoPaytable)), `Plinko ${rtp}`).toBeLessThanOrEqual(0.005);
      }
      // Wheel
      {
        const nextSeed = seedStream(0x1234567);
        let returned = 0;
        for (let i = 0; i < SIM_ROUNDS; i++) returned += resolveWheelRound(STAKE, nextSeed()).returnMinor;
        const rtp = returned / (STAKE * SIM_ROUNDS);
        expect(Math.abs(rtp - expectedValue(wheelPaytable)), `Wheel ${rtp}`).toBeLessThanOrEqual(0.005);
      }
      // Dice: je Wettstufe eine eigene Tabelle
      for (const [index, bet] of DICE_BETS.entries()) {
        const nextSeed = seedStream(0xabcdef + index * 7919);
        let returned = 0;
        for (let i = 0; i < SIM_ROUNDS; i++) returned += resolveDiceRound(STAKE, nextSeed(), bet.id).returnMinor;
        const rtp = returned / (STAKE * SIM_ROUNDS);
        expect(Math.abs(rtp - 0.97), `Dice ${bet.id}: ${rtp}`).toBeLessThanOrEqual(0.005);
      }
    },
    600_000,
  );
});

describe("Plinko Demo", () => {
  it("Binomialkoeffizienten sind exakt und summieren auf 2^12", () => {
    expect([...PLINKO_BINOMIALS]).toEqual([1, 12, 66, 220, 495, 792, 924, 792, 495, 220, 66, 12, 1]);
    expect(PLINKO_BINOMIALS.reduce((a, b) => a + b, 0)).toBe(PLINKO_TOTAL_PATHS);
    expect(binomialRow(4)).toEqual([1, 4, 6, 4, 1]);
    expect(binomialRow(0)).toEqual([1]);
    // Die Wahrscheinlichkeiten sind exakte Binärbrüche und summieren ohne Drift auf 1.
    let sum = 0;
    for (let k = 0; k < PLINKO_BUCKET_COUNT; k++) sum += plinkoBucketProbability(k);
    expect(sum).toBe(1);
  });

  it("Multiplikatoren stehen außen hoch und in der Mitte niedrig, Erwartungswert 96,36 %", () => {
    const values = Array.from({ length: PLINKO_BUCKET_COUNT }, (_, k) => plinkoMultiplier(k));
    expect(values).toEqual([24, 9, 3, 1.5, 1, 0.8, 0.4, 0.8, 1, 1.5, 3, 9, 24]);
    // Exakter Nachweis über Zähler: Σ C(12,k)·m(k) = 3946,8 bei Nenner 4096.
    const numerator = values.reduce((acc, m, k) => acc + (PLINKO_BINOMIALS[k] ?? 0) * m, 0);
    expect(numerator).toBeCloseTo(3946.8, 9);
    expect(expectedValue(plinkoPaytable)).toBeCloseTo(3946.8 / 4096, 12);
    expect(expectedValue(plinkoPaytable)).toBeGreaterThan(0.96);
    expect(expectedValue(plinkoPaytable)).toBeLessThan(0.97);
  });

  it("der Weg der Kugel führt zum berechneten Fach", () => {
    // Zusicherungen werden aggregiert; expect() in einer 20.000er-Schleife ist um Größenordnungen
    // langsamer als die geprüfte Logik selbst.
    const problems: string[] = [];
    for (let seed = 1; seed <= 20_000; seed++) {
      const round = resolvePlinkoRound(STAKE, seed);
      const rights = round.path.filter((s) => s === "R").length;
      const positions = plinkoPositions(round.path);
      let stepsOk = true;
      for (let i = 1; i < positions.length; i++) {
        const step = (positions[i] ?? 0) - (positions[i - 1] ?? 0);
        if (step !== 0 && step !== 1) stepsOk = false;
      }
      if (
        round.path.length !== PLINKO_ROWS ||
        round.bucket !== rights ||
        round.bucket !== plinkoBucketOf(round.path) ||
        positions.length !== PLINKO_ROWS + 1 ||
        positions[PLINKO_ROWS] !== round.bucket ||
        !stepsOk ||
        round.entry.key !== `b${round.bucket}` ||
        round.multiplier !== plinkoMultiplier(round.bucket)
      ) {
        problems.push(`Seed ${seed}: ${round.path.join("")} → Fach ${round.bucket}`);
      }
    }
    expect(problems).toEqual([]);
  });

  it("die Fachverteilung ist binomial (300.000 Runden, ±0,4 Prozentpunkte je Fach)", () => {
    const rounds = 300_000;
    const nextSeed = seedStream(0xfeed);
    const counts = new Array<number>(PLINKO_BUCKET_COUNT).fill(0);
    for (let i = 0; i < rounds; i++) {
      const bucket = plinkoBucketOf(plinkoPath(nextSeed()));
      counts[bucket] = (counts[bucket] ?? 0) + 1;
    }
    for (let k = 0; k < PLINKO_BUCKET_COUNT; k++) {
      const observed = (counts[k] ?? 0) / rounds;
      expect(Math.abs(observed - plinkoBucketProbability(k)), `Fach ${k}: ${observed}`).toBeLessThan(0.004);
    }
    expect(counts.reduce((a, b) => a + b, 0)).toBe(rounds);
  });

  it("Anti-Near-Miss: markiert wird ausschließlich das getroffene Fach", () => {
    for (let bucket = 0; bucket < PLINKO_BUCKET_COUNT; bucket++) {
      expect(plinkoHighlight(bucket)).toEqual([bucket]);
    }
    // Das Ergebnisdetail transportiert nur Weg, Fach und Multiplikator — keine Nachbarschaft.
    const outcome = resolvePlinko(STAKE, 4242);
    expect(Object.keys(outcome.detail ?? {}).sort()).toEqual(["bucket", "multiplier", "path"]);
  });

  it("Rückgaben sind ganzzahlig und nie negativ; Determinismus über den Seed", () => {
    const plinkoProblems = collectProblems(2000, (seed) => {
      const a = resolvePlinko(37, seed);
      const b = resolvePlinko(37, seed);
      return JSON.stringify(a) === JSON.stringify(b) && Number.isInteger(a.returnMinor) && a.returnMinor >= 0;
    });
    expect(plinkoProblems).toEqual([]);
    const seeds = new Set(Array.from({ length: 500 }, (_, i) => resolvePlinko(100, i + 1).outcomeKey));
    expect(seeds.size).toBeGreaterThan(1);
    expect(parsePlinkoDetail(resolvePlinko(100, 99).detail)?.bucket).toBe(resolvePlinkoRound(100, 99).bucket);
    expect(parsePlinkoDetail(undefined)).toBeNull();
    expect(parsePlinkoDetail({ path: "LL", bucket: 0 })).toBeNull();
  });
});

describe("Mines Demo", () => {
  it("die Multiplikator-Staffel ist 0,97 / P(k) und steigt monoton", () => {
    for (const mines of MINES_COUNTS) {
      const ladder = minesLadder(mines);
      expect(ladder.length).toBe(MINES_CELLS - mines);
      for (let k = 1; k <= MINES_CELLS - mines; k++) {
        const p = minesSafeProbability(mines, k);
        expect(minesMultiplier(mines, k)).toBe(Math.round((0.97 / p) * 100) / 100);
        if (k > 1) expect(minesMultiplier(mines, k)).toBeGreaterThan(minesMultiplier(mines, k - 1));
      }
      expect(minesMultiplier(mines, 0)).toBe(0);
    }
    // Nachgerechnete Stützwerte
    expect(minesSafeProbability(3, 1)).toBeCloseTo(22 / 25, 12);
    expect(minesSafeProbability(3, 2)).toBeCloseTo(462 / 600, 12);
    expect(minesMultiplier(3, 1)).toBe(1.1);
    expect(minesMultiplier(3, 2)).toBe(1.26);
    // Alle sicheren Felder: P = 1 / C(25, m)
    expect(minesSafeProbability(3, 22)).toBeCloseTo(1 / 2300, 15);
    expect(minesMultiplier(3, 22)).toBe(2231);
    expect(minesMultiplier(1, 24)).toBe(24.25);
    expect(minesMultiplier(5, 20)).toBe(51536.1);
  });

  it("die Minen stehen vor dem ersten Aufdecken fest und ändern sich nicht", () => {
    const problems: string[] = [];
    for (let seed = 1; seed <= 5000; seed++) {
      for (const mines of MINES_COUNTS) {
        const first = minePositions(seed, mines);
        // Wiederholte Auswertung desselben Seeds liefert dieselben Positionen — es gibt keinen
        // Zustand, über den sich eine Mine nachträglich verschieben ließe.
        const again = minePositions(seed, mines);
        const outcome = startMinesRound(100, seed, `m${mines}`);
        const positions = outcome.detail?.positions;
        const valid =
          first.length === mines &&
          new Set(first).size === mines &&
          first.every((p) => Number.isInteger(p) && p >= 0 && p < MINES_CELLS) &&
          again.join(",") === first.join(",") &&
          Array.isArray(positions) &&
          (positions as number[]).join(",") === first.join(",") &&
          outcome.returnMinor === 0;
        if (!valid) problems.push(`Seed ${seed}/${mines} Minen: ${first.join(",")}`);
      }
    }
    expect(problems).toEqual([]);
  });

  it("die Minenpositionen sind gleichverteilt (100.000 Runden, ±1 Prozentpunkt je Feld)", () => {
    const rounds = 100_000;
    const mines: MinesCount = 3;
    const nextSeed = seedStream(0x5150);
    const counts = new Array<number>(MINES_CELLS).fill(0);
    for (let i = 0; i < rounds; i++) {
      for (const p of minePositions(nextSeed(), mines)) counts[p] = (counts[p] ?? 0) + 1;
    }
    for (let cell = 0; cell < MINES_CELLS; cell++) {
      const share = (counts[cell] ?? 0) / rounds;
      expect(Math.abs(share - mines / MINES_CELLS), `Feld ${cell}: ${share}`).toBeLessThan(0.01);
    }
  });

  it("maxReturnMinor wird über 200.000 simulierte Runden nie überschritten", () => {
    const nextSeed = seedStream(0xbeef);
    const rng = mulberry32(0xc0de);
    const stakes = [10, 25, 33, 100, 250, 999, 1000];
    const problems: string[] = [];
    let cashOuts = 0;
    let mineHits = 0;
    for (let i = 0; i < 200_000; i++) {
      const seed = nextSeed();
      const mines = MINES_COUNTS[i % MINES_COUNTS.length] ?? 3;
      const stake = stakes[i % stakes.length] ?? 100;
      const declaredMax = minesMaxReturnMinor(stake, mines);
      const start = startMinesRound(stake, seed, `m${mines}`);

      // Zufälliges Spielverhalten: aufdecken, bis eine Mine kommt oder ausgezahlt wird.
      const positions = minePositions(seed, mines);
      let revealed = 0;
      let returnMinor = 0;
      let hit = false;
      for (let cell = 0; cell < MINES_CELLS; cell++) {
        const pick = Math.floor(rng() * MINES_CELLS);
        if (positions.includes(pick)) {
          returnMinor = 0;
          hit = true;
          break;
        }
        revealed = Math.min(revealed + 1, MINES_CELLS - mines);
        returnMinor = minesReturnMinor(stake, mines, revealed);
        if (rng() < 0.2) break; // Auszahlen
      }
      if (hit) mineHits += 1;
      else if (returnMinor > 0) cashOuts += 1;
      if (
        !Number.isInteger(declaredMax) ||
        start.maxReturnMinor !== declaredMax ||
        !Number.isInteger(returnMinor) ||
        returnMinor < 0 ||
        returnMinor > declaredMax
      ) {
        problems.push(`Runde ${i}: Rückgabe ${returnMinor} > Obergrenze ${declaredMax}`);
      }
    }
    expect(problems).toEqual([]);
    // Beide Ausgänge kommen im Testlauf tatsächlich vor.
    expect(mineHits).toBeGreaterThan(0);
    expect(cashOuts).toBeGreaterThan(0);
  }, 120_000);

  it("Determinismus über den Seed; unterschiedliche Seeds liefern nicht immer dasselbe", () => {
    expect(startMinesRound(100, 777, "m3")).toEqual(startMinesRound(100, 777, "m3"));
    const variants = new Set(Array.from({ length: 200 }, (_, i) => minePositions(i + 1, 3).join(",")));
    expect(variants.size).toBeGreaterThan(1);
    // Unbekannte oder fehlende Wett-ID fällt auf die Voreinstellung (3 Minen) zurück.
    expect(startMinesRound(100, 5, undefined).detail?.mines).toBe(3);
    expect(startMinesRound(100, 5, "m99").detail?.mines).toBe(3);
  });
});

describe("Dice Demo", () => {
  it("Trefferwahrscheinlichkeit und Auszahlung passen zueinander (RTP exakt 97 % je Stufe)", () => {
    expect(DICE_BETS.length).toBe(10);
    for (const bet of DICE_BETS) {
      // Abgezählte Trefferwahrscheinlichkeit über alle 100 möglichen Würfe
      let wins = 0;
      for (let roll = DICE_MIN_ROLL; roll <= DICE_MAX_ROLL; roll++) if (isDiceWin(bet, roll)) wins += 1;
      expect(wins / 100, bet.id).toBe(bet.winChance);
      // Auszahlung = 0,97 / p, auf zwei Nachkommastellen — hier ohne Rundungsverlust
      expect(bet.multiplier).toBe(Math.round((0.97 / bet.winChance) * 100) / 100);
      expect(bet.multiplier * bet.winChance).toBe(0.97);
    }
    // Alle Stufen haben denselben RTP — ohne Toleranz.
    const rtps = dicePaytables.map((t) => expectedValue(t));
    for (const rtp of rtps) expect(rtp).toBe(0.97);
    expect(new Set(rtps).size).toBe(1);
  });

  it("die Würfe sind gleichverteilt über 1 … 100", () => {
    const rounds = 400_000;
    const nextSeed = seedStream(0x7a11);
    const counts = new Array<number>(DICE_MAX_ROLL + 1).fill(0);
    let outOfRange = 0;
    for (let i = 0; i < rounds; i++) {
      const roll = rollDice(nextSeed());
      if (!Number.isInteger(roll) || roll < DICE_MIN_ROLL || roll > DICE_MAX_ROLL) outOfRange += 1;
      else counts[roll] = (counts[roll] ?? 0) + 1;
    }
    expect(outOfRange).toBe(0);
    expect(counts[0]).toBe(0);
    const deviations = counts
      .slice(DICE_MIN_ROLL, DICE_MAX_ROLL + 1)
      .map((count, index) => ({ roll: index + DICE_MIN_ROLL, deviation: Math.abs(count / rounds - 0.01) }));
    expect(deviations.filter((d) => d.deviation >= 0.002)).toEqual([]);
  });

  it("Zielwerte sind sauber gewählt: unter t ⇒ p = (t−1)/100, über t ⇒ p = (100−t)/100", () => {
    for (const bet of DICE_BETS) {
      const expected = bet.direction === "under" ? (bet.target - 1) / 100 : (100 - bet.target) / 100;
      expect(bet.winChance, bet.id).toBe(expected);
      expect(isDiceWin(bet, bet.target), `${bet.id}: Zielwert selbst ist kein Treffer`).toBe(false);
    }
  });

  it("Rückgaben sind ganzzahlig und nie negativ; Determinismus über den Seed", () => {
    const diceProblems = collectProblems(2000, (seed) => {
      const a = resolveDice(37, seed, "under-26");
      const b = resolveDice(37, seed, "under-26");
      return JSON.stringify(a) === JSON.stringify(b) && Number.isInteger(a.returnMinor) && a.returnMinor >= 0;
    });
    expect(diceProblems).toEqual([]);
    const rolls = new Set(Array.from({ length: 500 }, (_, i) => rollDice(i + 1)));
    expect(rolls.size).toBeGreaterThan(1);
  });
});

describe("Wheel Demo", () => {
  it("16 Segmente, Verteilung und Erwartungswert stimmen", () => {
    expect(WHEEL_SEGMENTS.length).toBe(WHEEL_SEGMENT_COUNT);
    const byValue = new Map<number, number>();
    for (const s of WHEEL_SEGMENTS) byValue.set(s.multiplier, (byValue.get(s.multiplier) ?? 0) + 1);
    expect([...byValue.entries()].sort((a, b) => a[0] - b[0])).toEqual([
      [0, 6],
      [0.5, 4],
      [1, 2],
      [1.5, 1],
      [2, 1],
      [3, 1],
      [5, 1],
    ]);
    const sumOfMultipliers = WHEEL_SEGMENTS.reduce((acc, s) => acc + s.multiplier, 0);
    expect(sumOfMultipliers).toBe(15.5);
    expect(expectedValue(wheelPaytable)).toBe(15.5 / 16);
    expect(expectedValue(wheelPaytable)).toBe(0.96875);
    // Jede Ergebnisklasse der Tabelle kommt auf dem Rad vor und umgekehrt.
    for (const entry of wheelPaytable.entries) {
      expect(WHEEL_SEGMENTS.some((s) => s.key === entry.key), entry.key).toBe(true);
      expect(WHEEL_SEGMENTS.filter((s) => s.key === entry.key).length / WHEEL_SEGMENT_COUNT).toBe(entry.probability);
    }
  });

  it("die Segmente treffen gleich häufig (400.000 Runden, ±0,5 Prozentpunkte)", () => {
    const rounds = 400_000;
    const nextSeed = seedStream(0x2b2b);
    const counts = new Array<number>(WHEEL_SEGMENT_COUNT).fill(0);
    for (let i = 0; i < rounds; i++) {
      const index = spinWheel(nextSeed()).index;
      counts[index] = (counts[index] ?? 0) + 1;
    }
    for (let i = 0; i < WHEEL_SEGMENT_COUNT; i++) {
      const share = (counts[i] ?? 0) / rounds;
      expect(Math.abs(share - 1 / WHEEL_SEGMENT_COUNT), `Segment ${i + 1}: ${share}`).toBeLessThan(0.005);
    }
  });

  it("Anti-Near-Miss: markiert wird ausschließlich das getroffene Segment", () => {
    for (let i = 0; i < WHEEL_SEGMENT_COUNT; i++) expect(wheelHighlight(i)).toEqual([i]);
    const outcome = resolveWheel(100, 31337);
    expect(Object.keys(outcome.detail ?? {}).sort()).toEqual(["index", "multiplier"]);
    // Die Radreihenfolge ist eine Konstante — sie wird zwischen Runden nie umsortiert.
    const before = WHEEL_SEGMENTS.map((s) => s.multiplier);
    for (let seed = 1; seed <= 1000; seed++) resolveWheel(100, seed);
    expect(WHEEL_SEGMENTS.map((s) => s.multiplier)).toEqual(before);
  });

  it("Rückgaben sind ganzzahlig und nie negativ; Determinismus über den Seed", () => {
    const wheelProblems = collectProblems(2000, (seed) => {
      const a = resolveWheel(37, seed);
      const b = resolveWheel(37, seed);
      return JSON.stringify(a) === JSON.stringify(b) && Number.isInteger(a.returnMinor) && a.returnMinor >= 0;
    });
    expect(wheelProblems).toEqual([]);
    const keys = new Set(Array.from({ length: 500 }, (_, i) => resolveWheel(100, i + 1).outcomeKey));
    expect(keys.size).toBeGreaterThan(1);
  });
});
