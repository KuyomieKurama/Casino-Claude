// @vitest-environment node
import { describe, expect, test } from "vitest";
import { createTestDatabase } from "@/server/db/test-harness";
import { user } from "@/server/db/auth-schema";
import { activateSelfExclusion } from "@/server/repositories/rg-settings-repository";
import { ADMIN_USERS_PAGE_SIZE, adminUsersSearchParamsSchema, resolveAdminUsersPage } from "./user-admin-read-model";

describe("adminUsersSearchParamsSchema", () => {
  test("ohne Angabe: Seite 1", () => {
    expect(adminUsersSearchParamsSchema.parse({})).toEqual({ page: 1 });
  });

  test("eine ungültige Seitenangabe fällt auf Seite 1 zurück", () => {
    expect(adminUsersSearchParamsSchema.parse({ page: "abc" })).toEqual({ page: 1 });
    expect(adminUsersSearchParamsSchema.parse({ page: "-3" })).toEqual({ page: 1 });
  });
});

describe("resolveAdminUsersPage", () => {
  test("berechnet pageCount aus total und Seitengröße", async () => {
    const db = await createTestDatabase();
    for (let i = 0; i < ADMIN_USERS_PAGE_SIZE + 3; i++) {
      await db.insert(user).values({ id: `u${i}`, name: `u${i}`, email: `u${i}@example.com` });
    }

    const page1 = await resolveAdminUsersPage(db, 1);
    expect(page1.items).toHaveLength(ADMIN_USERS_PAGE_SIZE);
    expect(page1.pageCount).toBe(2);

    const page2 = await resolveAdminUsersPage(db, 2);
    expect(page2.items).toHaveLength(3);
  });

  test("reichert jede Zeile um die lesende RG-Kurzfassung an (Admin-Auftrag §3: nur Einsicht)", async () => {
    const db = await createTestDatabase();
    await db.insert(user).values({ id: "u1", name: "u1", email: "u1@example.com" });
    await db.insert(user).values({ id: "u2", name: "u2", email: "u2@example.com" });
    await activateSelfExclusion(db, "u1", new Date().toISOString());

    const { items } = await resolveAdminUsersPage(db, 1);

    const u1 = items.find((i) => i.id === "u1");
    const u2 = items.find((i) => i.id === "u2");
    expect(u1?.rg).toMatchObject({ selfExcluded: true });
    expect(u2?.rg).toBeNull(); // kein rg_setting-Eintrag angelegt
  });
});
