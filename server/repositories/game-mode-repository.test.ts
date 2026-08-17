// @vitest-environment node
// PGlite lädt sein WASM-Bundle intern über `fetch()`/`Response`. jsdoms Fetch-Polyfill
// (globale Vitest-Umgebung, vitest.config.ts) implementiert `Response.arrayBuffer()` nicht
// vollständig kompatibel — nur in dieser Datei auf die echte Node-Umgebung umschalten, ohne
// die globale jsdom-Konfiguration für alle anderen (React-)Tests anzutasten.
import { sql } from "drizzle-orm";
import { describe, expect, test } from "vitest";
import { createTestDatabase, seedMinimalCatalog } from "@/server/db/test-harness";
import { PgGameModeRepository } from "./game-mode-repository";
import type { GameModeUpsertInput } from "./types";

function modeInput(gameId: string, overrides: Partial<GameModeUpsertInput> = {}): GameModeUpsertInput {
  return {
    id: "test-mode",
    gameId,
    key: "standard",
    label: "Standard",
    kind: "variant",
    engineKey: "slot",
    paytableKey: "g-classic-fruit",
    minBetMinor: 10,
    maxBetMinor: 1000,
    isLivePresentation: false,
    isDefault: true,
    sortOrder: 0,
    status: "active",
    ...overrides,
  };
}

describe("PgGameModeRepository", () => {
  test("schreibt einen Modus und liest ihn über findById und findByGameId zurück", async () => {
    // Arrange
    const db = await createTestDatabase();
    const { gameId } = await seedMinimalCatalog(db);
    const repo = new PgGameModeRepository(db);

    // Act
    await repo.upsert(modeInput(gameId));
    const byId = await repo.findById("test-mode");
    const byGame = await repo.findByGameId(gameId);

    // Assert
    expect(byId?.id).toBe("test-mode");
    expect(byId?.paytableKey).toBe("g-classic-fruit");
    expect(byGame).toHaveLength(1);
  });

  test("der Fremdschlüssel auf game greift: ein unbekannter gameId wird abgelehnt", async () => {
    const db = await createTestDatabase();
    const repo = new PgGameModeRepository(db);

    await expect(repo.upsert(modeInput("does-not-exist"))).rejects.toThrow();
  });

  test("upsert ist idempotent: zweiter Aufruf aktualisiert dieselbe Zeile", async () => {
    // Arrange
    const db = await createTestDatabase();
    const { gameId } = await seedMinimalCatalog(db);
    const repo = new PgGameModeRepository(db);
    await repo.upsert(modeInput(gameId));

    // Act
    await repo.upsert(modeInput(gameId, { label: "Aktualisiert" }));
    const all = await repo.findAll();

    // Assert
    expect(all).toHaveLength(1);
    expect(all[0]?.label).toBe("Aktualisiert");
  });

  test("CHECK-Constraint lehnt einen ungültigen kind-Wert ab", async () => {
    // Direktes SQL statt Repository: `kind` ist über TypeScript auf "variant"|"presentation"
    // beschränkt (server/db/enums.ts) — ein ungültiger Wert lässt sich nur über rohes SQL
    // erzeugen. Das prüft gezielt die CHECK-Klausel selbst, nicht nur den TS-Typ.
    const db = await createTestDatabase();
    const { gameId } = await seedMinimalCatalog(db);

    await expect(
      db.execute(sql`
        insert into game_mode (id, game_id, key, label, kind, engine_key, min_bet_minor, max_bet_minor, sort_order, status)
        values ('bad-kind', ${gameId}, 'x', 'X', 'not-a-kind', 'slot', 10, 1000, 0, 'active')
      `),
    ).rejects.toThrow();
  });

  test("CHECK-Constraint lehnt einen ungültigen status-Wert ab", async () => {
    const db = await createTestDatabase();
    const { gameId } = await seedMinimalCatalog(db);

    await expect(
      db.execute(sql`
        insert into game_mode (id, game_id, key, label, kind, engine_key, min_bet_minor, max_bet_minor, sort_order, status)
        values ('bad-status', ${gameId}, 'x', 'X', 'variant', 'slot', 10, 1000, 0, 'not-a-status')
      `),
    ).rejects.toThrow();
  });

  test("partieller Unique-Index: ein zweiter is_default=true für denselben Titel wird abgelehnt", async () => {
    // Arrange
    const db = await createTestDatabase();
    const { gameId } = await seedMinimalCatalog(db);
    const repo = new PgGameModeRepository(db);
    await repo.upsert(modeInput(gameId, { id: "mode-a", key: "a", isDefault: true }));

    // Act & Assert: eine ANDERE Zeile (id "mode-b") mit is_default=true für denselben gameId.
    await expect(repo.upsert(modeInput(gameId, { id: "mode-b", key: "b", isDefault: true }))).rejects.toThrow();
  });

  test("partieller Unique-Index erlaubt beliebig viele is_default=false-Zeilen je Titel", async () => {
    const db = await createTestDatabase();
    const { gameId } = await seedMinimalCatalog(db);
    const repo = new PgGameModeRepository(db);
    await repo.upsert(modeInput(gameId, { id: "mode-a", key: "a", isDefault: true }));

    await expect(repo.upsert(modeInput(gameId, { id: "mode-b", key: "b", isDefault: false }))).resolves.toBeDefined();
    await expect(repo.upsert(modeInput(gameId, { id: "mode-c", key: "c", isDefault: false }))).resolves.toBeDefined();
  });
});
