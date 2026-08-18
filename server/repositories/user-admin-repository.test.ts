// @vitest-environment node
import { describe, expect, test } from "vitest";
import { createTestDatabase } from "@/server/db/test-harness";
import { user, session } from "@/server/db/auth-schema";
import { seedMinimalCatalog } from "@/server/db/test-harness";
import { insertOpenRound } from "./game-round-repository";
import { countSessionsForUser, deleteSessionsForUser, findAdminUserById, listAdminUsers, updateAdminUserStatus } from "./user-admin-repository";

async function seedUser(db: Awaited<ReturnType<typeof createTestDatabase>>, id: string, overrides: Partial<{ role: "user" | "admin"; status: "active" | "disabled"; isGuest: boolean }> = {}) {
  await db.insert(user).values({ id, name: id, email: `${id}@example.com`, ...overrides });
}

describe("findAdminUserById", () => {
  test("liefert den Nutzer ohne rundenbezogene Felder", async () => {
    const db = await createTestDatabase();
    await seedUser(db, "u1", { role: "user", status: "active" });

    const found = await findAdminUserById(db, "u1");

    expect(found).toMatchObject({ id: "u1", role: "user", status: "active", isGuest: false });
  });

  test("liefert null für einen unbekannten Nutzer", async () => {
    const db = await createTestDatabase();
    await expect(findAdminUserById(db, "does-not-exist")).resolves.toBeNull();
  });
});

describe("listAdminUsers", () => {
  test("zählt Runden je Nutzer korrekt mit", async () => {
    const db = await createTestDatabase();
    const { gameId } = await seedMinimalCatalog(db);
    const { PgGameModeRepository } = await import("./game-mode-repository");
    await new PgGameModeRepository(db).upsert({
      id: "mode-1",
      gameId,
      key: "standard",
      label: "Standard",
      kind: "variant",
      engineKey: "slot",
      paytableKey: null,
      minBetMinor: 10,
      maxBetMinor: 1000,
      isLivePresentation: false,
      isDefault: true,
      sortOrder: 0,
      status: "active",
    });
    await seedUser(db, "u1");
    await seedUser(db, "u2");
    await insertOpenRound(db, {
      id: "r1",
      userId: "u1",
      gameModeId: "mode-1",
      stakeMinor: 100,
      seed: 1,
      maxReturnMinor: 1000,
      idempotencyKey: "k1",
      transcript: {},
    });

    const { items, total } = await listAdminUsers(db, { limit: 10, offset: 0 });

    expect(total).toBe(2);
    const u1 = items.find((i) => i.id === "u1");
    const u2 = items.find((i) => i.id === "u2");
    expect(u1?.roundCount).toBe(1);
    expect(u2?.roundCount).toBe(0);
  });

  test("begrenzt die Seitengröße (limit/offset), keine unbegrenzte Abfrage", async () => {
    const db = await createTestDatabase();
    for (let i = 0; i < 5; i++) await seedUser(db, `u${i}`);

    const { items, total } = await listAdminUsers(db, { limit: 2, offset: 0 });

    expect(items).toHaveLength(2);
    expect(total).toBe(5);
  });
});

describe("updateAdminUserStatus", () => {
  test("aktualisiert den Status und liefert die neue Zeile", async () => {
    const db = await createTestDatabase();
    await seedUser(db, "u1", { status: "active" });

    const updated = await updateAdminUserStatus(db, "u1", "disabled");

    expect(updated?.status).toBe("disabled");
  });

  test("liefert null für einen unbekannten Nutzer, statt zu werfen", async () => {
    const db = await createTestDatabase();
    await expect(updateAdminUserStatus(db, "does-not-exist", "disabled")).resolves.toBeNull();
  });
});

describe("Sitzungen widerrufen", () => {
  test("countSessionsForUser und deleteSessionsForUser", async () => {
    const db = await createTestDatabase();
    await seedUser(db, "u1");
    await db.insert(session).values([
      { id: "s1", userId: "u1", token: "t1", expiresAt: new Date(Date.now() + 3_600_000) },
      { id: "s2", userId: "u1", token: "t2", expiresAt: new Date(Date.now() + 3_600_000) },
    ]);

    await expect(countSessionsForUser(db, "u1")).resolves.toBe(2);

    const deleted = await deleteSessionsForUser(db, "u1");

    expect(deleted).toBe(2);
    await expect(countSessionsForUser(db, "u1")).resolves.toBe(0);
  });
});
