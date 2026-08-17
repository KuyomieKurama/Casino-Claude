// @vitest-environment node
// PGlite lädt sein WASM-Bundle intern über `fetch()`/`Response`. jsdoms Fetch-Polyfill
// (globale Vitest-Umgebung, vitest.config.ts) implementiert `Response.arrayBuffer()` nicht
// vollständig kompatibel — nur in dieser Datei auf die echte Node-Umgebung umschalten, ohne
// die globale jsdom-Konfiguration für alle anderen (React-)Tests anzutasten.
import { describe, expect, test } from "vitest";
import { games as allGames } from "@/data/games";
import { paytablesOf } from "@/data/paytables";
import { ENGINE_BY_GAME_ID } from "@/components/game/engine/registry";
import { createTestDatabase } from "@/server/db/test-harness";
import { PgGameModeRepository } from "@/server/repositories/game-mode-repository";
import { PgGameRepository } from "@/server/repositories/game-repository";
import { PgProviderRepository } from "@/server/repositories/provider-repository";
import { seedCatalog } from "./seed";

describe("seedCatalog", () => {
  test("ist idempotent: ein zweiter Lauf verändert die Zeilenzahlen nicht", async () => {
    // Arrange
    const db = await createTestDatabase();

    // Act
    const first = await seedCatalog(db);
    const second = await seedCatalog(db);

    // Assert
    expect(second).toEqual(first);
    expect(await new PgProviderRepository(db).findAll()).toHaveLength(first.providerCount);
    expect(await new PgGameRepository(db).findAll()).toHaveLength(first.gameCount);
    expect(await new PgGameModeRepository(db).findAll()).toHaveLength(first.gameModeCount);
  });

  test("jede der 24 heutigen Game.id aus data/games.ts existiert danach als game_mode.id", async () => {
    // Arrange
    const db = await createTestDatabase();
    await seedCatalog(db);
    const modes = await new PgGameModeRepository(db).findAll();
    const modeIds = new Set(modes.map((m) => m.id));

    // Assert
    expect(allGames).toHaveLength(24);
    for (const game of allGames) {
      expect(modeIds.has(game.id), `${game.id} fehlt als game_mode.id`).toBe(true);
    }
    expect(modeIds.size).toBe(24);
  });

  test("jeder gesetzte paytable_key ist über data/paytables/index.ts auflösbar", async () => {
    const db = await createTestDatabase();
    await seedCatalog(db);
    const modes = await new PgGameModeRepository(db).findAll();

    const withPaytable = modes.filter((m) => m.paytableKey !== null);
    expect(withPaytable.length).toBeGreaterThan(0);
    for (const mode of withPaytable) {
      expect(paytablesOf(mode.paytableKey!).length, `${mode.id}: paytableKey "${mode.paytableKey}" ohne Tabelle`).toBeGreaterThan(0);
    }
  });

  test("jeder Modus hat einen Registry-Eintrag; gleicher engine_key ⇒ dieselbe Engine-Komponente", async () => {
    // Arrange
    const db = await createTestDatabase();
    await seedCatalog(db);
    const modes = await new PgGameModeRepository(db).findAll();

    // Assert: Registry kennt jede ID (unverändert, da game_mode.id = heutige Game.id).
    for (const mode of modes) {
      expect(ENGINE_BY_GAME_ID[mode.id], `Registry kennt ${mode.id} nicht`).toBeDefined();
    }

    // Assert: engine_key gruppiert genau wie die tatsächliche Registry-Zuordnung — verglichen
    // über die echten Komponentenreferenzen, nicht über einen geratenen Namen.
    const componentByEngineKey = new Map<string, unknown>();
    for (const mode of modes) {
      const component = ENGINE_BY_GAME_ID[mode.id];
      const seen = componentByEngineKey.get(mode.engineKey);
      if (seen === undefined) {
        componentByEngineKey.set(mode.engineKey, component);
      } else {
        expect(component, `engine_key "${mode.engineKey}" zeigt bei ${mode.id} auf eine andere Komponente`).toBe(seen);
      }
    }
    const distinctComponents = new Set(componentByEngineKey.values());
    expect(distinctComponents.size, "zwei verschiedene engine_key-Werte zeigen auf dieselbe Komponente").toBe(componentByEngineKey.size);
  });

  test("genau ein Standardmodus je Titel", async () => {
    const db = await createTestDatabase();
    await seedCatalog(db);
    const modes = await new PgGameModeRepository(db).findAll();
    const games = await new PgGameRepository(db).findAll();

    for (const game of games) {
      const defaults = modes.filter((m) => m.gameId === game.id && m.isDefault);
      expect(defaults, `Titel ${game.id} hat ${defaults.length} Standardmodi`).toHaveLength(1);
    }
  });

  test("legt alle sechs Anbieter aus data/providers.ts an", async () => {
    const db = await createTestDatabase();
    const result = await seedCatalog(db);
    expect(result.providerCount).toBe(6);
  });
});
