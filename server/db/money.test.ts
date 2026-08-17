// @vitest-environment node
// PGlite lädt sein WASM-Bundle intern über `fetch()`/`Response`. jsdoms Fetch-Polyfill
// (globale Vitest-Umgebung, vitest.config.ts) implementiert `Response.arrayBuffer()` nicht
// vollständig kompatibel — nur in dieser Datei auf die echte Node-Umgebung umschalten, ohne
// die globale jsdom-Konfiguration für alle anderen (React-)Tests anzutasten.
import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";
import { gameMode } from "./schema";
import { createTestDatabase, seedMinimalCatalog } from "./test-harness";

/**
 * `MAX_BALANCE_MINOR` (99.999.999,99 Credits → 9.999.999.999 Hundertstel) ist die Obergrenze
 * des Projekts (lib/constants.ts) und liegt über INT32 (2.147.483.647) — deshalb `bigint`,
 * nicht `integer`, für Geldspalten. `pg` liefert `bigint` standardmäßig als String; Drizzles
 * `mode: "number"` (server/db/schema.ts) muss das beim Lesen zuverlässig in eine sichere
 * JavaScript-Zahl zurückwandeln.
 */
const MAX_BALANCE_MINOR = 99_999_999_99;

describe("Geldspalten (bigint, mode: number)", () => {
  test("ein Betrag nahe MAX_BALANCE_MINOR kommt als sicherer number zurück", async () => {
    // Arrange
    const db = await createTestDatabase();
    const { gameId } = await seedMinimalCatalog(db);

    // Act
    await db.insert(gameMode).values({
      id: "test-mode-max-bet",
      gameId,
      key: "standard",
      label: "Standard",
      kind: "variant",
      engineKey: "slot",
      paytableKey: null,
      minBetMinor: MAX_BALANCE_MINOR - 1,
      maxBetMinor: MAX_BALANCE_MINOR,
      sortOrder: 0,
      status: "active",
      isDefault: true,
    });
    const [row] = await db.select().from(gameMode).where(eq(gameMode.id, "test-mode-max-bet")).limit(1);

    // Assert
    expect(row).toBeDefined();
    expect(typeof row?.maxBetMinor).toBe("number");
    expect(typeof row?.minBetMinor).toBe("number");
    expect(row?.maxBetMinor).toBe(MAX_BALANCE_MINOR);
    expect(row?.minBetMinor).toBe(MAX_BALANCE_MINOR - 1);
    expect(Number.isSafeInteger(row?.maxBetMinor)).toBe(true);
    expect(Number.isSafeInteger(row?.minBetMinor)).toBe(true);
  });
});
