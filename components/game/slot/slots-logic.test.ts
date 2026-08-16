import { describe, expect, it } from "vitest";
import { expectedValue, mulberry32, pickOutcome, resolveRound, totalProbability } from "@/lib/rng";
import { buildPaytable, rtpOf } from "@/lib/paytable";
import { slotPaytables } from "@/data/paytables/slots";
import { games } from "@/data/catalog";
import { SLOT_OUTCOME_KEYS } from "./symbols";

const slotGames = games.filter((g) => g.category === "slots");
const tableOf = (gameId: string) => slotPaytables.find((t) => t.gameId === gameId)!;
const maxMultiplier = (gameId: string) => Math.max(...tableOf(gameId).entries.map((e) => e.multiplier));
const zeroProbability = (gameId: string) => tableOf(gameId).entries.find((e) => e.key === "none")!.probability;
const byVolatility = (v: "low" | "medium" | "high") => slotGames.filter((g) => g.volatility === v).map((g) => g.id);

describe("Auszahlungstabellen der Slots", () => {
  it("Für jeden der elf Slots liegt genau eine Tabelle vor", () => {
    expect(slotGames.length).toBe(11);
    expect(slotPaytables.length).toBe(11);
    for (const g of slotGames) {
      const matches = slotPaytables.filter((t) => t.gameId === g.id);
      expect(matches.length, g.name).toBe(1);
    }
  });

  it("Jede Tabelle summiert exakt auf 1 und benutzt die acht bekannten Ergebnisklassen", () => {
    for (const table of slotPaytables) {
      // data/ darf lib/ nicht importieren (Schichtregel §3) — die Prüfung von buildPaytable
      // (Summe exakt 1, keine negativen Werte) läuft deshalb hier über jede Tabelle.
      expect(() => buildPaytable(table.gameId, table.entries), table.gameId).not.toThrow();
      expect(Math.abs(totalProbability(table) - 1), table.gameId).toBeLessThanOrEqual(1e-9);
      expect(table.entries.map((e) => e.key), table.gameId).toEqual([...SLOT_OUTCOME_KEYS]);
      for (const e of table.entries) {
        expect(e.probability, `${table.gameId}/${e.key}`).toBeGreaterThan(0);
        expect(e.multiplier, `${table.gameId}/${e.key}`).toBeGreaterThanOrEqual(0);
        expect(e.label.length, `${table.gameId}/${e.key}`).toBeGreaterThan(0);
      }
      // Aufsteigend nach Multiplikator, absteigend nach Wahrscheinlichkeit ab der ersten Rückgabe.
      const multipliers = table.entries.map((e) => e.multiplier);
      expect([...multipliers].sort((a, b) => a - b), table.gameId).toEqual(multipliers);
    }
  });

  it("Der ausgewiesene Demo-RTP liegt im realistischen Bereich 94 – 96,5 %", () => {
    for (const g of slotGames) {
      const rtp = rtpOf(tableOf(g.id));
      expect(rtp, g.name).toBeGreaterThanOrEqual(0.94);
      expect(rtp, g.name).toBeLessThanOrEqual(0.965);
      // Regel 6: der angezeigte Wert IST der Erwartungswert der Tabelle.
      expect(g.rtpDemo, g.name).toBeCloseTo(rtp, 9);
    }
  });

  it("Die Referenztabelle von Neon Nights ist unverändert (Demo-RTP 95,0 %)", () => {
    const neon = tableOf("g-neon-nights");
    expect(neon.entries).toEqual([
      { key: "none", label: "Nullrunde", multiplier: 0, probability: 0.505 },
      { key: "partial", label: "Teilrückgabe", multiplier: 0.5, probability: 0.2 },
      { key: "push", label: "Einsatz zurück", multiplier: 1, probability: 0.15 },
      { key: "small", label: "Kleiner Treffer", multiplier: 2, probability: 0.09 },
      { key: "hit", label: "Treffer", multiplier: 5, probability: 0.036 },
      { key: "big", label: "Großer Treffer", multiplier: 10, probability: 0.014 },
      { key: "streak", label: "Serie", multiplier: 25, probability: 0.004 },
      { key: "top", label: "Höchstgewinn", multiplier: 100, probability: 0.001 },
    ]);
    expect(expectedValue(neon)).toBeCloseTo(0.95, 12);
  });
});

describe("Volatilität passt zur Tabelle", () => {
  it("Höchstmultiplikator: high deutlich über medium, medium über low", () => {
    const low = byVolatility("low").map(maxMultiplier);
    const medium = byVolatility("medium").map(maxMultiplier);
    const high = byVolatility("high").map(maxMultiplier);
    expect(low.length, "Spiele mit low").toBeGreaterThan(0);
    expect(high.length, "Spiele mit high").toBeGreaterThan(0);
    expect(Math.max(...low)).toBeLessThan(Math.min(...medium));
    expect(Math.max(...medium)).toBeLessThan(Math.min(...high));
    // Vorgabe: low höchstens 50×, high mindestens 400×.
    expect(Math.max(...low)).toBeLessThanOrEqual(50);
    expect(Math.min(...high)).toBeGreaterThanOrEqual(400);
  });

  it("Nullrundenwahrscheinlichkeit steigt mit der Volatilität", () => {
    const low = byVolatility("low").map(zeroProbability);
    const medium = byVolatility("medium").map(zeroProbability);
    const high = byVolatility("high").map(zeroProbability);
    expect(Math.max(...low)).toBeLessThan(Math.min(...medium));
    expect(Math.max(...medium)).toBeLessThan(Math.min(...high));
  });

  it("Spiele mit low geben häufiger etwas zurück als Spiele mit high", () => {
    const returnChance = (gameId: string) => 1 - zeroProbability(gameId);
    for (const lowId of byVolatility("low")) {
      for (const highId of byVolatility("high")) {
        expect(returnChance(lowId), `${lowId} vs ${highId}`).toBeGreaterThan(returnChance(highId));
      }
    }
  });
});

describe("Rundenauflösung", () => {
  it("Gleicher Seed ⇒ gleiches Ergebnis, verschiedene Seeds ⇒ nicht immer gleich", () => {
    for (const table of slotPaytables) {
      expect(resolveRound(table, 250, 987654), table.gameId).toEqual(resolveRound(table, 250, 987654));
      const keys = new Set<string>();
      for (let seed = 0; seed < 500; seed++) keys.add(resolveRound(table, 100, seed).entry.key);
      expect(keys.size, table.gameId).toBeGreaterThan(1);
    }
  });

  it("Rückgaben sind ganzzahlig und nie negativ", () => {
    for (const table of slotPaytables) {
      for (const stake of [10, 25, 33, 100, 250, 1000, 2000]) {
        for (let seed = 0; seed < 300; seed++) {
          const { returnMinor, netMinor } = resolveRound(table, stake, seed);
          expect(Number.isInteger(returnMinor), `${table.gameId}/${stake}/${seed}`).toBe(true);
          expect(returnMinor, `${table.gameId}/${stake}/${seed}`).toBeGreaterThanOrEqual(0);
          expect(netMinor).toBe(returnMinor - stake);
        }
      }
    }
  });
});

/**
 * RTP-Prüfung in zwei Stufen (Vorbild und Begründung: lib/rng.test.ts).
 *
 * (a) 100.000 systematische Stichproben u = (i + 0,5)/N je Tabelle. Ohne Zufallsrauschen; prüft
 *     exakt, dass die Zuordnung u → Ergebnisklasse den Erwartungswert der Tabelle trifft.
 * (b) 5.000.000 PRNG-Runden je Tabelle mit festem Seed. Bei den Tabellen mit 500×-Spitze liegt die
 *     Standardabweichung des Rundenmultiplikators bei ≈ 5,4; über 5 Mio. Runden ergibt das einen
 *     Standardfehler von ≈ 0,24 Prozentpunkten, die geforderten ±0,5 pp sind damit ein
 *     ≈ 2-σ-Kriterium. Der Seed ist fest, das Ergebnis also reproduzierbar und nicht flaky.
 */
describe("RTP-Simulation", () => {
  it("#a Tabellenzuordnung trifft den Erwartungswert über 100.000 systematische Runden (±0,5 pp)", () => {
    const stake = 100;
    const rounds = 100_000;
    for (const table of slotPaytables) {
      let returned = 0;
      for (let i = 0; i < rounds; i++) returned += Math.round(stake * pickOutcome(table, (i + 0.5) / rounds).multiplier);
      const rtp = returned / (stake * rounds);
      expect(Math.abs(rtp - expectedValue(table)), table.gameId).toBeLessThanOrEqual(0.005);
    }
  });

  it("#b PRNG-Simulation trifft den ausgewiesenen RTP — 5.000.000 Runden je Tabelle, ±0,5 pp", () => {
    const stake = 100;
    const rounds = 5_000_000;
    const started = Date.now();
    for (const table of slotPaytables) {
      const rng = mulberry32((0x51a7ab ^ (table.gameId.length * 2654435761)) >>> 0);
      let returned = 0;
      for (let i = 0; i < rounds; i++) returned += Math.round(stake * pickOutcome(table, rng()).multiplier);
      const rtp = returned / (stake * rounds);
      const target = expectedValue(table);
      expect(Math.abs(rtp - target), `${table.gameId}: ${rtp} vs ${target}`).toBeLessThanOrEqual(0.005);
    }
    // Laufzeit im Blick behalten: 11 Tabellen × 5 Mio. Runden.
    console.log(`RTP-Simulation: ${slotPaytables.length} Tabellen × ${rounds.toLocaleString("de-DE")} Runden in ${Date.now() - started} ms`);
  });
});
