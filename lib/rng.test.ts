import { describe, expect, it } from "vitest";
import { expectedValue, mulberry32, pickOutcome, resolveRound, totalProbability } from "./rng";
import { betIdOf, paytables, paytablesOf } from "@/data/paytables";
import { games } from "@/data/catalog";
import { rtpOf } from "./paytable";

/** Tabellenschlüssel „gameId" oder „gameId::betId" → Spiel-ID. */
const gameIdOf = (paytableId: string) => (paytableId.includes("::") ? paytableId.slice(0, paytableId.indexOf("::")) : paytableId);

describe("Zufallslogik", () => {
  it("mulberry32 ist deterministisch und liefert Werte in [0,1)", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 1000; i++) {
      const x = a();
      expect(x).toBe(b());
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });

  it("jede Tabelle summiert auf 1,000 und gehört zu einem existierenden Spiel", () => {
    expect(paytables.length).toBeGreaterThan(0);
    for (const table of paytables) {
      expect(totalProbability(table), table.gameId).toBeCloseTo(1, 9);
      const gameId = gameIdOf(table.gameId);
      expect(games.find((g) => g.id === gameId), `Spiel ${gameId} fehlt`).toBeDefined();
      // Ein Multiplikator von 0 ist erlaubt (Nullrunde), negative Werte nicht.
      for (const e of table.entries) {
        expect(e.multiplier, `${table.gameId}/${e.key}`).toBeGreaterThanOrEqual(0);
        expect(e.probability, `${table.gameId}/${e.key}`).toBeGreaterThanOrEqual(0);
      }
      const betId = betIdOf(table.gameId);
      if (betId) expect(betId.length, table.gameId).toBeGreaterThan(0);
    }
  });

  it("Der ausgewiesene rtpDemo ist der Erwartungswert der Tabelle (Regel 6)", () => {
    for (const g of games) {
      const tables = paytablesOf(g.id);
      if (tables.length === 0) {
        expect(g.rtpDemo, `${g.name} hat rtpDemo ohne Tabelle`).toBeUndefined();
        continue;
      }
      const values = tables.map(rtpOf);
      const uniform = values.every((v) => Math.abs(v - values[0]!) < 1e-9);
      if (uniform) {
        expect(g.rtpDemo, `${g.name} müsste einen RTP ausweisen`).toBeDefined();
        expect(g.rtpDemo!).toBeCloseTo(values[0]!, 9);
      } else {
        // Unterschiedliche Wetten ⇒ kein einzelner Spiel-RTP, sondern Angabe je Wette.
        expect(g.rtpDemo, `${g.name} darf keinen gemeinsamen RTP behaupten`).toBeUndefined();
      }
    }
  });

  /**
   * Abweichung von der Vorgabe „100.000 Runden, ±0,5 Prozentpunkte“ — begründet:
   *
   * Die geforderte Toleranz ist keine Eigenschaft der Tabelle, sondern des Stichprobenumfangs.
   * Bei Neon Nights beträgt die Standardabweichung des Rundenmultiplikators ≈ 3,8 (der 100×-Treffer
   * mit p = 0,001 dominiert); über 100.000 Runden liegt der Standardfehler damit bei ≈ 1,2
   * Prozentpunkten. ±0,5 pp wäre ein 0,4-σ-Kriterium — der Test würde bei etwa einem Drittel aller
   * Seeds scheitern, ohne dass an der Tabelle etwas falsch wäre. Umgekehrt sind 5.000.000 Runden
   * für eine Roulette-Tabelle (σ ≈ 1) reine Rechenzeitverschwendung.
   *
   * Deshalb zwei Prüfungen:
   *  (a) 100.000 systematische Stützstellen (u = (i+0,5)/N) über JEDE Tabelle — prüft die
   *      Tabellenzuordnung exakt, ganz ohne Zufallsrauschen.
   *  (b) eine PRNG-Simulation je Tabelle, deren Rundenzahl aus der Varianz der Tabelle folgt:
   *      n = (σ / 0,0015)², gedeckelt auf 5.000.000. Damit hat jede Tabelle denselben
   *      Standardfehler von höchstens 0,15 pp, und ±0,5 pp entspricht überall ≈ 3 σ.
   */
  it("#5a Tabellenzuordnung trifft den RTP über 100.000 systematische Runden exakt (±0,5 pp)", () => {
    for (const table of paytables) {
      const stake = 100;
      const rounds = 100_000;
      let returned = 0;
      for (let i = 0; i < rounds; i++) {
        const entry = pickOutcome(table, (i + 0.5) / rounds);
        returned += Math.round(stake * entry.multiplier);
      }
      const rtp = returned / (stake * rounds);
      expect(Math.abs(rtp - expectedValue(table)), table.gameId).toBeLessThanOrEqual(0.005);
    }
  });

  it("#5b PRNG-Simulation trifft den ausgewiesenen RTP je Tabelle, ±0,5 Prozentpunkte", () => {
    const TARGET_SE = 0.0015;
    let totalRounds = 0;
    for (const table of paytables) {
      const target = expectedValue(table);
      // Varianz des Rundenmultiplikators: E[m²] − (E[m])²
      const secondMoment = table.entries.reduce((s, e) => s + e.multiplier * e.multiplier * e.probability, 0);
      const sigma = Math.sqrt(Math.max(0, secondMoment - target * target));
      const rounds = Math.min(5_000_000, Math.max(200_000, Math.ceil((sigma / TARGET_SE) ** 2)));
      totalRounds += rounds;

      const rng = mulberry32(0xc0ffee ^ table.gameId.length);
      const stake = 100;
      let returned = 0;
      for (let i = 0; i < rounds; i++) {
        const entry = pickOutcome(table, rng());
        returned += Math.round(stake * entry.multiplier);
      }
      const rtp = returned / (stake * rounds);
      expect(
        Math.abs(rtp - target),
        `${table.gameId}: gemessen ${rtp.toFixed(5)}, erwartet ${target.toFixed(5)} (σ=${sigma.toFixed(2)}, n=${rounds})`,
      ).toBeLessThanOrEqual(0.005);
    }
    console.info(`RTP-Simulation: ${paytables.length} Tabellen, ${(totalRounds / 1e6).toFixed(1)} Mio. Runden gesamt`);
  });

  it("resolveRound ist reproduzierbar und ganzzahlig", () => {
    const table = paytables[0]!;
    const a = resolveRound(table, 33, 987654);
    const b = resolveRound(table, 33, 987654);
    expect(a).toEqual(b);
    expect(Number.isInteger(a.returnMinor)).toBe(true);
    expect(a.netMinor).toBe(a.returnMinor - 33);
  });

  it("pickOutcome deckt alle Klassen ab und wählt bei u=0 die erste Klasse", () => {
    const table = paytables[0]!;
    expect(pickOutcome(table, 0).key).toBe(table.entries[0]!.key);
    expect(pickOutcome(table, 0.999999).key).toBe(table.entries.at(-1)!.key);
    const seen = new Set<string>();
    const rng = mulberry32(7);
    for (let i = 0; i < 200_000; i++) seen.add(pickOutcome(table, rng()).key);
    expect(seen.size).toBe(table.entries.length);
  });
});
