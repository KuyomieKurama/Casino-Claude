// @vitest-environment node
// PGlite lädt sein WASM-Bundle intern über `fetch()`/`Response`. jsdoms Fetch-Polyfill
// (globale Vitest-Umgebung, vitest.config.ts) implementiert `Response.arrayBuffer()` nicht
// vollständig kompatibel — nur in dieser Datei auf die echte Node-Umgebung umschalten, ohne
// die globale jsdom-Konfiguration für alle anderen (React-)Tests anzutasten.
import { describe, expect, test } from "vitest";
import { createTestDatabase } from "@/server/db/test-harness";
import { PgProviderRepository } from "./provider-repository";
import { PgGameRepository } from "./game-repository";
import type { GameUpsertInput } from "./types";

const BASE_INPUT: GameUpsertInput = {
  id: "gm-neon-nights",
  slug: "neon-nights",
  name: "Neon Nights",
  category: "slots",
  providerId: "velora-studios",
  description: "Fünf Walzen im Licht einer nächtlichen Skyline.",
  status: "active",
  isFeatured: true,
  isNew: false,
  isPopular: true,
  releasedAt: "2026-02-03T00:00:00.000Z",
  popularityScore: 96,
  sortOrder: 1,
};

describe("PgGameRepository", () => {
  test("schreibt einen Titel und liest ihn über findById und findBySlug zurück", async () => {
    // Arrange
    const db = await createTestDatabase();
    await new PgProviderRepository(db).upsert({ id: "velora-studios", name: "Velora Studios" });
    const repo = new PgGameRepository(db);

    // Act
    const written = await repo.upsert(BASE_INPUT);
    const byId = await repo.findById("gm-neon-nights");
    const bySlug = await repo.findBySlug("neon-nights");

    // Assert
    expect(written.name).toBe("Neon Nights");
    expect(byId).not.toBeNull();
    expect(bySlug).not.toBeNull();
    expect(byId?.id).toBe("gm-neon-nights");
    expect(bySlug?.id).toBe("gm-neon-nights");
    // Zeitstempel kommen als ISO-String zurück (schema.ts: Date, Repository wandelt um).
    expect(byId?.releasedAt).toBe("2026-02-03T00:00:00.000Z");
    expect(typeof byId?.createdAt).toBe("string");
    expect(() => new Date(byId!.createdAt)).not.toThrow();
  });

  test("der Fremdschlüssel auf provider greift: ein unbekannter providerId wird abgelehnt", async () => {
    // Arrange
    const db = await createTestDatabase();
    const repo = new PgGameRepository(db);

    // Act & Assert
    await expect(repo.upsert({ ...BASE_INPUT, providerId: "does-not-exist" })).rejects.toThrow();
  });

  test("upsert ist idempotent: zweiter Aufruf aktualisiert dieselbe Zeile", async () => {
    // Arrange
    const db = await createTestDatabase();
    await new PgProviderRepository(db).upsert({ id: "velora-studios", name: "Velora Studios" });
    const repo = new PgGameRepository(db);
    await repo.upsert(BASE_INPUT);

    // Act
    await repo.upsert({ ...BASE_INPUT, name: "Neon Nights (aktualisiert)" });
    const all = await repo.findAll();

    // Assert
    expect(all).toHaveLength(1);
    expect(all[0]?.name).toBe("Neon Nights (aktualisiert)");
  });
});
