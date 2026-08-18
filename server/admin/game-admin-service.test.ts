// @vitest-environment node
import { describe, expect, test } from "vitest";
import { createTestDatabase, seedMinimalCatalog } from "@/server/db/test-harness";
import { user } from "@/server/db/auth-schema";
import { PgGameModeRepository } from "@/server/repositories/game-mode-repository";
import { PgGameRepository } from "@/server/repositories/game-repository";
import type { GameModeUpsertInput } from "@/server/repositories/types";
import { listAdminAuditLogPage } from "@/server/repositories/admin-audit-log-repository";
import * as gameAdminService from "./game-admin-service";
import { setGameModeStatus, setGameStatus, updateGameListingFields } from "./game-admin-service";

async function seedAdmin(db: Awaited<ReturnType<typeof createTestDatabase>>) {
  await db.insert(user).values({ id: "admin-1", name: "Admin", email: "admin@example.com", role: "admin" });
}

/**
 * `PgGameRepository.upsert()` erwartet `GameUpsertInput` (OHNE createdAt/updatedAt, siehe
 * server/repositories/types.ts) — `findById()` liefert dagegen den vollen `GameRecord` MIT
 * beiden Feldern als ISO-Strings. Diese Test-Hilfsfunktion setzt den Status direkt um (ohne den
 * zu testenden Service), OHNE die Timestamp-Felder versehentlich mit einzuschleusen (sonst
 * versucht Drizzles Timestamp-Mapper `.toISOString()` auf einem bereits-String aufzurufen).
 */
async function forceGameStatus(gameRepo: PgGameRepository, gameId: string, status: "active" | "inactive") {
  const current = await gameRepo.findById(gameId);
  if (!current) throw new Error(`Test-Setup: Titel „${gameId}" existiert nicht.`);
  await gameRepo.upsert({
    id: current.id,
    slug: current.slug,
    name: current.name,
    category: current.category,
    providerId: current.providerId,
    description: current.description,
    isFeatured: current.isFeatured,
    isNew: current.isNew,
    isPopular: current.isPopular,
    releasedAt: current.releasedAt,
    popularityScore: current.popularityScore,
    sortOrder: current.sortOrder,
    status,
  });
}

function modeInput(gameId: string, overrides: Partial<GameModeUpsertInput> = {}): GameModeUpsertInput {
  return {
    id: "mode-1",
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

describe("setGameStatus — Admin-Auftrag §2 (Titel ohne aktiven Modus kann nicht aktiv sein)", () => {
  test("Aktivieren eines Titels ohne jeden aktiven Modus wird abgelehnt", async () => {
    const db = await createTestDatabase();
    await seedAdmin(db);
    const { gameId } = await seedMinimalCatalog(db); // status: "active" per Default in seedMinimalCatalog
    await new PgGameModeRepository(db).upsert(modeInput(gameId, { status: "inactive" }));
    await forceGameStatus(new PgGameRepository(db), gameId, "inactive");

    const result = await setGameStatus(db, "admin-1", gameId, "active");

    expect(result).toEqual({ ok: false, reason: "NO_ACTIVE_MODE" });
  });

  test("Aktivieren eines Titels MIT mindestens einem aktiven Modus gelingt und schreibt einen Audit-Eintrag", async () => {
    const db = await createTestDatabase();
    await seedAdmin(db);
    const { gameId } = await seedMinimalCatalog(db);
    await new PgGameModeRepository(db).upsert(modeInput(gameId, { status: "active" }));
    const gameRepo = new PgGameRepository(db);
    await forceGameStatus(gameRepo, gameId, "inactive");

    const result = await setGameStatus(db, "admin-1", gameId, "active");

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.game.status).toBe("active");
    const { entries } = await listAdminAuditLogPage(db, { limit: 10 });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ action: "game.status.update", entityId: gameId });
  });

  test("Deaktivieren ist immer erlaubt, auch ohne aktiven Modus", async () => {
    const db = await createTestDatabase();
    await seedAdmin(db);
    const { gameId } = await seedMinimalCatalog(db);

    const result = await setGameStatus(db, "admin-1", gameId, "inactive");

    expect(result.ok).toBe(true);
  });

  test("unbekannter Titel liefert NOT_FOUND", async () => {
    const db = await createTestDatabase();
    await seedAdmin(db);

    const result = await setGameStatus(db, "admin-1", "does-not-exist", "active");

    expect(result).toEqual({ ok: false, reason: "NOT_FOUND" });
  });

  test("paytable_key, engine_key und RTP-relevante Felder werden über diesen Service nirgends geschrieben (kein API dafür vorhanden)", () => {
    // Struktureller Test: die exportierten Funktionen des Moduls decken nur status/isFeatured/
    // sortOrder ab — es gibt keine Funktion, die paytableKey oder engineKey annimmt.
    const moduleExports = Object.keys(gameAdminService);
    expect(moduleExports).toEqual(expect.arrayContaining(["setGameStatus", "setGameModeStatus", "updateGameListingFields"]));
    expect(moduleExports).not.toContain("setPaytableKey");
    expect(moduleExports).not.toContain("setEngineKey");
    expect(moduleExports).not.toContain("setRtp");
  });
});

describe("updateGameListingFields", () => {
  test("aktualisiert isFeatured und sortOrder mit Audit-Eintrag", async () => {
    const db = await createTestDatabase();
    await seedAdmin(db);
    const { gameId } = await seedMinimalCatalog(db);

    const result = await updateGameListingFields(db, "admin-1", gameId, { isFeatured: true, sortOrder: 5 });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.game.isFeatured).toBe(true);
      expect(result.game.sortOrder).toBe(5);
    }
    const { entries } = await listAdminAuditLogPage(db, { limit: 10 });
    expect(entries).toHaveLength(1);
    expect(entries[0]?.action).toBe("game.listing.update");
  });

  test("unbekannter Titel liefert NOT_FOUND", async () => {
    const db = await createTestDatabase();
    await seedAdmin(db);
    const result = await updateGameListingFields(db, "admin-1", "does-not-exist", { isFeatured: true });
    expect(result).toEqual({ ok: false, reason: "NOT_FOUND" });
  });
});

describe("setGameModeStatus — spiegelbildliche Invariante", () => {
  test("Deaktivieren des letzten aktiven Modus eines aktiven Titels wird abgelehnt", async () => {
    const db = await createTestDatabase();
    await seedAdmin(db);
    const { gameId } = await seedMinimalCatalog(db); // Titel ist "active"
    await new PgGameModeRepository(db).upsert(modeInput(gameId, { status: "active" }));

    const result = await setGameModeStatus(db, "admin-1", "mode-1", "inactive");

    expect(result).toEqual({ ok: false, reason: "LAST_ACTIVE_MODE_OF_ACTIVE_GAME" });
  });

  test("Deaktivieren ist erlaubt, wenn ein weiterer aktiver Modus desselben Titels bestehen bleibt", async () => {
    const db = await createTestDatabase();
    await seedAdmin(db);
    const { gameId } = await seedMinimalCatalog(db);
    const modeRepo = new PgGameModeRepository(db);
    await modeRepo.upsert(modeInput(gameId, { id: "mode-1", key: "a", status: "active", isDefault: true }));
    await modeRepo.upsert(modeInput(gameId, { id: "mode-2", key: "b", status: "active", isDefault: false }));

    const result = await setGameModeStatus(db, "admin-1", "mode-1", "inactive");

    expect(result.ok).toBe(true);
  });

  test("Deaktivieren ist erlaubt, wenn der übergeordnete Titel bereits inaktiv ist", async () => {
    const db = await createTestDatabase();
    await seedAdmin(db);
    const { gameId } = await seedMinimalCatalog(db);
    const gameRepo = new PgGameRepository(db);
    await forceGameStatus(gameRepo, gameId, "inactive");
    await new PgGameModeRepository(db).upsert(modeInput(gameId, { status: "active" }));

    const result = await setGameModeStatus(db, "admin-1", "mode-1", "inactive");

    expect(result.ok).toBe(true);
  });

  test("unbekannter Modus liefert NOT_FOUND", async () => {
    const db = await createTestDatabase();
    await seedAdmin(db);
    const result = await setGameModeStatus(db, "admin-1", "does-not-exist", "inactive");
    expect(result).toEqual({ ok: false, reason: "NOT_FOUND" });
  });
});
