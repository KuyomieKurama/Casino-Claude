// @vitest-environment node
// PGlite lädt sein WASM-Bundle intern über `fetch()`/`Response`. jsdoms Fetch-Polyfill
// (globale Vitest-Umgebung, vitest.config.ts) implementiert `Response.arrayBuffer()` nicht
// vollständig kompatibel — nur in dieser Datei auf die echte Node-Umgebung umschalten, ohne
// die globale jsdom-Konfiguration für alle anderen (React-)Tests anzutasten.
import { describe, expect, test } from "vitest";
import { createTestDatabase } from "@/server/db/test-harness";
import { PgProviderRepository } from "./provider-repository";

describe("PgProviderRepository", () => {
  test("schreibt einen Anbieter und liest ihn über findById zurück", async () => {
    // Arrange
    const db = await createTestDatabase();
    const repo = new PgProviderRepository(db);

    // Act
    await repo.upsert({ id: "velora-studios", name: "Velora Studios" });
    const found = await repo.findById("velora-studios");

    // Assert
    expect(found).toEqual({ id: "velora-studios", name: "Velora Studios" });
  });

  test("findById liefert null für eine unbekannte ID", async () => {
    const db = await createTestDatabase();
    const repo = new PgProviderRepository(db);

    const found = await repo.findById("does-not-exist");

    expect(found).toBeNull();
  });

  test("upsert ist idempotent: zweiter Aufruf mit derselben ID aktualisiert statt zu duplizieren", async () => {
    // Arrange
    const db = await createTestDatabase();
    const repo = new PgProviderRepository(db);
    await repo.upsert({ id: "velora-studios", name: "Alter Name" });

    // Act
    await repo.upsert({ id: "velora-studios", name: "Velora Studios" });
    const all = await repo.findAll();

    // Assert
    expect(all).toHaveLength(1);
    expect(all[0]).toEqual({ id: "velora-studios", name: "Velora Studios" });
  });

  test("findAll liefert ein leeres Array ohne gespeicherte Anbieter", async () => {
    const db = await createTestDatabase();
    const repo = new PgProviderRepository(db);

    const all = await repo.findAll();

    expect(all).toEqual([]);
  });
});
