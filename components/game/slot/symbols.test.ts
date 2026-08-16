import { describe, expect, it } from "vitest";
import { gridForOutcome, reelStrip, SLOT_OUTCOME_KEYS, SLOT_THEMES, themeFor } from "./symbols";
import { games } from "@/data/catalog";
import { paytablesOf } from "@/data/paytables";

const slotGames = games.filter((g) => g.category === "slots");
const themeIds = Object.keys(SLOT_THEMES);

describe("Symbolsätze der Slots", () => {
  it("Jeder Slot des Katalogs hat einen eigenen Symbolsatz", () => {
    expect(slotGames.length).toBe(11);
    for (const g of slotGames) expect(themeIds, g.name).toContain(g.id);
    expect(themeIds.length).toBe(slotGames.length);
  });

  it("Walzenzahl: drei bei „klassisch“, sonst fünf", () => {
    for (const g of slotGames) {
      const expected = g.tags.includes("klassisch") ? 3 : 5;
      expect(themeFor(g.id).reels, g.name).toBe(expected);
    }
  });

  it("Jeder Satz hat genug verschiedene Symbole für eine Nullrunde ohne Höchstwerte", () => {
    for (const g of slotGames) {
      const theme = themeFor(g.id);
      expect(new Set(theme.symbols).size, `${g.name}: doppelte Symbole`).toBe(theme.symbols.length);
      const usable = theme.symbols.filter((s) => !theme.highValue.includes(s));
      expect(usable.length, `${g.name}: zu wenige Symbole ohne Höchstwert`).toBeGreaterThanOrEqual(theme.reels);
      // Die Symbole der drei höchsten Klassen gehören zum Satz und sind als Höchstwerte markiert.
      for (const s of theme.highValue) expect(theme.symbols, `${g.name}: ${s}`).toContain(s);
      for (const key of ["big", "streak", "top"] as const) {
        const symbol = theme.outcome[key];
        expect(symbol, `${g.name}/${key}`).toBeDefined();
        expect(theme.highValue, `${g.name}/${key}`).toContain(symbol!);
      }
    }
  });

  it("Jede Ergebnisklasse der Tabelle hat eine definierte Darstellung", () => {
    for (const g of slotGames) {
      const table = paytablesOf(g.id)[0];
      expect(table, `${g.name} ohne Auszahlungstabelle`).toBeDefined();
      const theme = themeFor(g.id);
      for (const e of table!.entries) {
        expect(SLOT_OUTCOME_KEYS as readonly string[], `${g.name}/${e.key}`).toContain(e.key);
        // „none“ hat bewusst kein Symbol, alle übrigen Klassen genau eines.
        if (e.key === "none") expect(theme.outcome.none, g.name).toBeUndefined();
        else expect(theme.outcome[e.key as (typeof SLOT_OUTCOME_KEYS)[number]], `${g.name}/${e.key}`).toBeDefined();
      }
    }
  });

  it("Der Symbolstreifen der Drehanimation zeigt nur Symbole des Spiels", () => {
    for (const g of slotGames) {
      const theme = themeFor(g.id);
      const strip = reelStrip(g.id);
      expect(strip.length).toBe(theme.symbols.length * 2);
      for (const s of strip) expect(theme.symbols, g.name).toContain(s);
    }
  });
});

describe("Walzendarstellung — Regel 7 (kein Near Miss), für alle Spiele", () => {
  it("Nullrunden zeigen auf der Gewinnlinie ausschließlich verschiedene Symbole", () => {
    for (const g of slotGames) {
      const reels = themeFor(g.id).reels;
      for (let seed = 0; seed < 2000; seed++) {
        const line = gridForOutcome(g.id, "none", seed).map((reel) => reel[1]);
        expect(new Set(line).size, `${g.name}/Seed ${seed}: ${line.join(",")}`).toBe(reels);
      }
    }
  });

  it("Nullrunden zeigen keine Höchstgewinn-Symbole auf der Gewinnlinie", () => {
    for (const g of slotGames) {
      const theme = themeFor(g.id);
      for (let seed = 0; seed < 2000; seed++) {
        const line = gridForOutcome(g.id, "none", seed).map((reel) => reel[1]!);
        for (const s of line) expect(theme.highValue.includes(s), `${g.name}/Seed ${seed}: ${s}`).toBe(false);
      }
    }
  });

  it("Füllzeilen bilden nie drei gleiche Symbole (keine zweite Scheinlinie)", () => {
    for (const g of slotGames) {
      const reels = themeFor(g.id).reels;
      for (const key of SLOT_OUTCOME_KEYS) {
        for (let seed = 0; seed < 300; seed++) {
          const grid = gridForOutcome(g.id, key, seed);
          for (const row of [0, 2]) {
            const cells = grid.map((reel) => reel[row]);
            const counts = new Map<string, number>();
            for (const c of cells) counts.set(c!, (counts.get(c!) ?? 0) + 1);
            expect(Math.max(...counts.values()), `${g.name}/${key}/${seed}/Zeile ${row}`).toBeLessThan(3);
            // Der Symbolvorrat reicht für vollständig verschiedene Füllzeilen — strengere Prüfung.
            expect(new Set(cells).size, `${g.name}/${key}/${seed}/Zeile ${row}`).toBe(reels);
          }
        }
      }
    }
  });

  it("Treffer zeigen auf allen Walzen das Symbol der jeweiligen Ergebnisklasse", () => {
    for (const g of slotGames) {
      const theme = themeFor(g.id);
      for (const key of SLOT_OUTCOME_KEYS) {
        const symbol = theme.outcome[key];
        if (!symbol) continue;
        const line = gridForOutcome(g.id, key, 123).map((reel) => reel[1]);
        expect(line, `${g.name}/${key}`).toEqual(Array.from({ length: theme.reels }, () => symbol));
      }
    }
  });

  it("Unbekannte Ergebnisklassen werden wie eine Nullrunde dargestellt", () => {
    for (const g of slotGames) {
      const theme = themeFor(g.id);
      const line = gridForOutcome(g.id, "gibt-es-nicht", 7).map((reel) => reel[1]!);
      expect(new Set(line).size, g.name).toBe(theme.reels);
      for (const s of line) expect(theme.highValue.includes(s), `${g.name}: ${s}`).toBe(false);
    }
  });

  it("Die Darstellung ist deterministisch aus Spiel, Ergebnisklasse und Seed", () => {
    for (const g of slotGames) {
      expect(gridForOutcome(g.id, "hit", 42), g.name).toEqual(gridForOutcome(g.id, "hit", 42));
      expect(gridForOutcome(g.id, "none", 1), g.name).not.toEqual(gridForOutcome(g.id, "none", 2));
    }
    // Gleicher Seed, anderes Spiel ⇒ anderer Symbolsatz, also andere Darstellung.
    expect(gridForOutcome("g-classic-fruit", "none", 3)).not.toEqual(gridForOutcome("g-mystic-jungle", "none", 3));
  });

  it("Ein unbekanntes Spiel fällt auf den Referenzsatz zurück, ohne zu werfen", () => {
    expect(themeFor("g-gibt-es-nicht").gameId).toBe("g-neon-nights");
    expect(gridForOutcome("g-gibt-es-nicht", "top", 5)).toEqual(gridForOutcome("g-neon-nights", "top", 5));
  });
});
