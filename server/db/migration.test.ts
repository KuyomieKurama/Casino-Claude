// @vitest-environment node
// PGlite lädt sein WASM-Bundle intern über `fetch()`/`Response`. jsdoms Fetch-Polyfill
// (globale Vitest-Umgebung, vitest.config.ts) implementiert `Response.arrayBuffer()` nicht
// vollständig kompatibel — nur in dieser Datei auf die echte Node-Umgebung umschalten, ohne
// die globale jsdom-Konfiguration für alle anderen (React-)Tests anzutasten.
import { sql } from "drizzle-orm";
import { describe, expect, test } from "vitest";
import { createTestDatabase } from "./test-harness";

describe("Migration", () => {
  test("wendet sich auf einer leeren Datenbank sauber an und legt alle Tabellen an", async () => {
    // Arrange & Act: createTestDatabase() erzeugt eine frische PGlite-Instanz und wendet die
    // echten, ausgelieferten SQL-Dateien aus server/db/migrations an (nicht nur schema.ts).
    const db = await createTestDatabase();

    // Assert
    const result = await db.execute<{ table_name: string }>(
      sql`select table_name from information_schema.tables where table_schema = 'public' order by table_name`,
    );
    const tableNames = result.rows.map((row) => row.table_name);
    // Phase 0 (Katalog) + Phase 1 (Auth, server/db/auth-schema.ts): acht Tabellen insgesamt.
    expect(tableNames).toEqual(["account", "game", "game_mode", "login_attempt", "provider", "session", "user", "verification"]);
  });

  test("ist wiederholt anwendbar, ohne Fehler zu werfen (leere Datenbank je Aufruf)", async () => {
    await expect(createTestDatabase()).resolves.toBeDefined();
    await expect(createTestDatabase()).resolves.toBeDefined();
  });
});
