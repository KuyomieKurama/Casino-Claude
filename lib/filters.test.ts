import { describe, expect, it } from "vitest";
import { applyFilters, criteriaFromParams, normalizeSearch, paramsFromCriteria, similarGames, suggestGames } from "./filters";
import { games } from "@/data/catalog";
import { providers } from "@/data/providers";

const providerNames = Object.fromEntries(providers.map((p) => [p.id, p.name]));

describe("Filterlogik", () => {
  it("Katalog hat 24 Spiele, davon 11 Slots, 6 Tischspiele, 4 Arcade/Game Shows, 3 Live-Demos", () => {
    expect(games).toHaveLength(24);
    expect(applyFilters(games, { cat: "slots" })).toHaveLength(11);
    const table = ["roulette", "blackjack", "baccarat", "poker"] as const;
    expect(games.filter((g) => (table as readonly string[]).includes(g.category))).toHaveLength(6);
    expect(applyFilters(games, { cat: "arcade" }).length + applyFilters(games, { cat: "gameshow" }).length).toBe(4);
    expect(applyFilters(games, { cat: "live" })).toHaveLength(3);
    expect(new Set(games.map((g) => g.slug)).size).toBe(24);
    expect(new Set(games.map((g) => g.id)).size).toBe(24);
    for (const g of games) expect(providerNames[g.providerId], `${g.name}: unbekannter Anbieter`).toBeDefined();
  });

  it("#6 Filterkombinationen liefern erwartete Mengen, inklusive Leermenge", () => {
    expect(applyFilters(games, {})).toHaveLength(24);
    expect(applyFilters(games, { cat: "slots", provider: "velora-studios" }).map((g) => g.slug).sort()).toEqual(["classic-fruit", "neon-nights"]);
    expect(applyFilters(games, { cat: "slots", mechanic: "kaskade" })).toHaveLength(3);
    expect(applyFilters(games, { cat: "slots", mechanic: "kaskade", difficulty: "advanced" }).map((g) => g.slug)).toEqual(["mystic-jungle"]);
    expect(applyFilters(games, { cat: "live", mechanic: "kaskade" })).toHaveLength(0);
    expect(applyFilters(games, { q: "gibtesnicht" })).toHaveLength(0);
    expect(applyFilters(games, { cat: "favorites" })).toHaveLength(0);
    expect(applyFilters(games, { cat: "favorites", favorites: ["g-neon-nights", "g-baccarat"] })).toHaveLength(2);
    expect(applyFilters(games, { cat: "new" }).every((g) => g.isNew)).toBe(true);
    expect(applyFilters(games, { cat: "popular" }).every((g) => g.isPopular)).toBe(true);
  });

  it("#7 Suche unabhängig von Groß-/Kleinschreibung und Umlauten", () => {
    expect(applyFilters(games, { q: "NEON" }).map((g) => g.slug)).toEqual(["neon-nights"]);
    expect(applyFilters(games, { q: "sandkonigin" }).map((g) => g.slug)).toEqual(["sandkoenigin"]);
    expect(applyFilters(games, { q: "sandkönigin" }).map((g) => g.slug)).toEqual(["sandkoenigin"]);
    expect(applyFilters(games, { q: "SANDKOENIGIN" }).map((g) => g.slug)).toEqual(["sandkoenigin"]);
    expect(applyFilters(games, { q: "fünf türme" }, providerNames).length).toBeGreaterThan(0);
    expect(applyFilters(games, { q: "funf turme" }, providerNames).length).toBe(applyFilters(games, { q: "Fünf Türme" }, providerNames).length);
    expect(normalizeSearch("Grün")).toBe(normalizeSearch("grun"));
    expect(normalizeSearch("Straße")).toBe("strasse");
    expect(normalizeSearch("  Café   Noir ")).toBe("cafe noir");
    // Sonderzeichen zerlegen die Suche nicht
    expect(() => applyFilters(games, { q: "(*+?[" })).not.toThrow();
    expect(applyFilters(games, { q: "***" })).toHaveLength(24);
  });

  it("Sortierung: Beliebtheit, Neuheit, Name, Empfehlung", () => {
    const pop = applyFilters(games, { sort: "popularity" });
    for (let i = 1; i < pop.length; i++) expect(pop[i - 1]!.popularityScore).toBeGreaterThanOrEqual(pop[i]!.popularityScore);
    const newest = applyFilters(games, { sort: "newest" });
    for (let i = 1; i < newest.length; i++) expect(newest[i - 1]!.releasedAt >= newest[i]!.releasedAt).toBe(true);
    const byName = applyFilters(games, { sort: "name" });
    expect(byName.map((g) => g.name)).toEqual([...byName.map((g) => g.name)].sort((a, b) => a.localeCompare(b, "de")));
    const rec = applyFilters(games, { sort: "recommended" });
    expect(rec.at(-1)?.status).toBe("inactive");
    expect(rec[0]?.isFeatured).toBe(true);
  });

  it("URL-Serialisierung ist verlustfrei und robust gegen ungültige Werte", () => {
    const params = paramsFromCriteria({ q: "neon", cat: "slots", provider: "velora-studios", sort: "name", mechanic: "wild", difficulty: "easy" });
    expect(params.toString()).toBe("q=neon&cat=slots&provider=velora-studios&mechanic=wild&difficulty=easy&sort=name");
    expect(criteriaFromParams(params)).toEqual({ q: "neon", cat: "slots", provider: "velora-studios", mechanic: "wild", difficulty: "easy", sort: "name" });
    expect(paramsFromCriteria({}).toString()).toBe("");
    const bad = criteriaFromParams(new URLSearchParams("cat=hacker&sort=drop&difficulty=x"));
    expect(bad.cat).toBe("all");
    expect(bad.sort).toBe("recommended");
    expect(bad.difficulty).toBe("");
  });

  it("Vorschläge und ähnliche Spiele schließen inaktive Spiele und das Spiel selbst aus", () => {
    const empty = suggestGames(games, []);
    expect(empty).toHaveLength(3);
    expect(empty.every((g) => g.status === "active")).toBe(true);
    const neon = games.find((g) => g.slug === "neon-nights")!;
    const similar = similarGames(games, neon, 4);
    expect(similar).toHaveLength(4);
    expect(similar.some((g) => g.id === neon.id)).toBe(false);
    expect(similar.every((g) => g.status === "active")).toBe(true);
    expect(similar[0]?.category).toBe("slots");
  });
});
