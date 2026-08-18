// @vitest-environment node
// Gleicher Grund wie server/seed/seed.test.ts: PGlite lädt sein WASM-Bundle über fetch()/
// Response, jsdoms Polyfill implementiert Response.arrayBuffer() nicht vollständig kompatibel.
import { describe, expect, test } from "vitest";
import { games as staticGames } from "@/data/games";
import { createTestDatabase } from "@/server/db/test-harness";
import { seedCatalog } from "@/server/seed/seed";
import { loadGameModeDetail, loadLobbyGames } from "./read-model";

describe("Katalog serverseitig lesen (server/catalog/read-model.ts)", () => {
  test("Datenbankstand entspricht data/games.ts: 24 Modi, je Modus Status und Einsatzgrenzen identisch", async () => {
    // Arrange
    const db = await createTestDatabase();
    await seedCatalog(db);

    // Act
    const lobbyGames = await loadLobbyGames(db);

    // Assert — Kern des Konsistenztests aus Auftrag §1: dadurch bleiben test/catalog.test.ts
    // und lib/filters.test.ts gültig, weil die reale Lobby dieselben 24 Modi in denselben
    // Zuständen zeigt wie die statische Liste, gegen die diese Tests weiterhin prüfen.
    expect(lobbyGames).toHaveLength(24);
    expect(staticGames).toHaveLength(24);
    const byId = new Map(lobbyGames.map((g) => [g.id, g]));
    for (const source of staticGames) {
      const fromDb = byId.get(source.id);
      expect(fromDb, `${source.id} fehlt im DB-Katalog`).toBeDefined();
      expect(fromDb!.status).toBe(source.status);
      expect(fromDb!.minDemoBetMinor).toBe(source.minDemoBetMinor);
      expect(fromDb!.maxDemoBetMinor).toBe(source.maxDemoBetMinor);
      expect(fromDb!.slug).toBe(source.slug);
    }
  });

  test("Geschwister-Hinweis: Titel mit mehreren Modi tragen siblingModes, Einzelmodus-Titel nicht", async () => {
    const db = await createTestDatabase();
    await seedCatalog(db);

    const lobbyGames = await loadLobbyGames(db);
    const byId = new Map(lobbyGames.map((g) => [g.id, g]));

    const european = byId.get("g-european-roulette")!;
    expect(european.siblingModes?.map((m) => m.label).sort()).toEqual(["Amerikanisch", "Live"].sort());

    const classicFruit = byId.get("g-classic-fruit")!;
    expect(classicFruit.siblingModes).toBeUndefined();
  });

  test("loadGameModeDetail liefert Titel, angeforderten Modus und alle Geschwister inklusive des aktiven", async () => {
    const db = await createTestDatabase();
    await seedCatalog(db);

    const detail = await loadGameModeDetail(db, "g-vip-blackjack");
    expect(detail).not.toBeNull();
    expect(detail!.title.name).toBe("Blackjack");
    expect(detail!.mode.label).toBe("VIP");
    expect(detail!.mode.minBetMinor).toBe(500);
    expect(detail!.mode.maxBetMinor).toBe(10000);
    expect(detail!.siblings.map((m) => m.id).sort()).toEqual(
      ["g-classic-blackjack", "g-vip-blackjack", "g-live-blackjack-demo"].sort(),
    );
  });

  test("loadGameModeDetail liefert null für eine unbekannte Modus-ID", async () => {
    const db = await createTestDatabase();
    await seedCatalog(db);
    expect(await loadGameModeDetail(db, "gibt-es-nicht")).toBeNull();
  });

  test("ein deaktivierter Modus wird geliefert (nicht ausgefiltert) und trägt status 'inactive'", async () => {
    const db = await createTestDatabase();
    await seedCatalog(db);

    const lobbyGames = await loadLobbyGames(db);
    const staubpfad = lobbyGames.find((g) => g.id === "g-staubpfad");
    expect(staubpfad?.status).toBe("inactive");

    const detail = await loadGameModeDetail(db, "g-staubpfad");
    expect(detail?.mode.status).toBe("inactive");
    // Einzelmodus-Titel: Geschwisterliste enthält nur den Modus selbst.
    expect(detail?.siblings).toHaveLength(1);
  });
});
