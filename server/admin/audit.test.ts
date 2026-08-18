// @vitest-environment node
import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";
import { createTestDatabase } from "@/server/db/test-harness";
import { user } from "@/server/db/auth-schema";
import { listAdminAuditLogPage } from "@/server/repositories/admin-audit-log-repository";
import { runAuditedAdminAction } from "./audit";

async function seedUser(db: Awaited<ReturnType<typeof createTestDatabase>>, id: string, overrides: Partial<{ status: "active" | "disabled" }> = {}) {
  await db.insert(user).values({ id, name: id, email: `${id}@example.com`, ...overrides });
}

describe("runAuditedAdminAction — Admin-Auftrag §4 (transaktionale Audit-Sicherung)", () => {
  test("Fachänderung und Audit-Eintrag landen gemeinsam in genau einem Commit", async () => {
    const db = await createTestDatabase();
    await seedUser(db, "admin-1", { status: "active" });
    await seedUser(db, "target-1", { status: "active" });

    await runAuditedAdminAction(
      db,
      { actorUserId: "admin-1", action: "user.status.update", entityType: "user", entityId: "target-1" },
      async (tx) => {
        await tx.update(user).set({ status: "disabled" }).where(eq(user.id, "target-1"));
        return { result: undefined, before: { status: "active" }, after: { status: "disabled" } };
      },
    );

    const [row] = await db.select().from(user).where(eq(user.id, "target-1"));
    expect(row?.status).toBe("disabled");

    const { entries } = await listAdminAuditLogPage(db, { limit: 10 });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ action: "user.status.update", entityType: "user", entityId: "target-1", before: { status: "active" }, after: { status: "disabled" } });
  });

  test("wirft mutate() eine Geschäftsregel-Verletzung, bleibt sowohl die Fachänderung als auch der Audit-Eintrag aus", async () => {
    const db = await createTestDatabase();
    await seedUser(db, "admin-1", { status: "active" });
    await seedUser(db, "target-1", { status: "active" });

    await expect(
      runAuditedAdminAction(db, { actorUserId: "admin-1", action: "user.status.update", entityType: "user", entityId: "target-1" }, async (tx) => {
        await tx.update(user).set({ status: "disabled" }).where(eq(user.id, "target-1"));
        throw new Error("Geschäftsregel verletzt");
      }),
    ).rejects.toThrow("Geschäftsregel verletzt");

    const [row] = await db.select().from(user).where(eq(user.id, "target-1"));
    expect(row?.status).toBe("active"); // unverändert — die Fachänderung wurde zurückgerollt

    const { entries } = await listAdminAuditLogPage(db, { limit: 10 });
    expect(entries).toHaveLength(0); // kein Audit-Eintrag
  });

  test("schlägt der Audit-Eintrag fehl (ungültiger actorUserId), wird auch die Fachänderung zurückgerollt — kein Audit-Eintrag bedeutet kein Commit", async () => {
    const db = await createTestDatabase();
    await seedUser(db, "target-1", { status: "active" });
    // Bewusst KEIN Nutzer "ghost-admin" angelegt — der Fremdschlüssel auf user.id schlägt fehl.

    await expect(
      runAuditedAdminAction(db, { actorUserId: "ghost-admin", action: "user.status.update", entityType: "user", entityId: "target-1" }, async (tx) => {
        await tx.update(user).set({ status: "disabled" }).where(eq(user.id, "target-1"));
        return { result: undefined, before: { status: "active" }, after: { status: "disabled" } };
      }),
    ).rejects.toThrow();

    const [row] = await db.select().from(user).where(eq(user.id, "target-1"));
    expect(row?.status).toBe("active"); // unverändert trotz "erfolgreichem" mutate()

    const { entries } = await listAdminAuditLogPage(db, { limit: 10 });
    expect(entries).toHaveLength(0);
  });
});
