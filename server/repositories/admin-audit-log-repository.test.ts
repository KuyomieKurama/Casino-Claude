// @vitest-environment node
// PGlite lädt sein WASM-Bundle intern über `fetch()`/`Response` — siehe game-mode-repository.test.ts
// für dieselbe Begründung, warum diese Datei auf die echte Node-Umgebung umschaltet.
import { describe, expect, test } from "vitest";
import { createTestDatabase } from "@/server/db/test-harness";
import { user } from "@/server/db/auth-schema";
import { insertAdminAuditLogEntry, listAdminAuditLogPage } from "./admin-audit-log-repository";

async function seedActor(db: Awaited<ReturnType<typeof createTestDatabase>>, id = "admin-1") {
  await db.insert(user).values({ id, name: "Admin", email: `${id}@example.com`, role: "admin" });
  return id;
}

describe("admin-audit-log-repository", () => {
  test("insertAdminAuditLogEntry schreibt einen Eintrag mit before/after", async () => {
    const db = await createTestDatabase();
    const actorId = await seedActor(db);

    const entry = await insertAdminAuditLogEntry(db, {
      actorUserId: actorId,
      action: "user.status.update",
      entityType: "user",
      entityId: "target-1",
      before: { status: "active" },
      after: { status: "disabled" },
    });

    expect(entry.id).toBeTruthy();
    expect(entry.action).toBe("user.status.update");
    expect(entry.before).toEqual({ status: "active" });
    expect(entry.after).toEqual({ status: "disabled" });
  });

  test("ein unbekannter actorUserId wird über den Fremdschlüssel abgelehnt (Grundlage der Transaktionssicherung)", async () => {
    const db = await createTestDatabase();

    await expect(
      insertAdminAuditLogEntry(db, {
        actorUserId: "does-not-exist",
        action: "user.status.update",
        entityType: "user",
        entityId: "target-1",
        before: null,
        after: null,
      }),
    ).rejects.toThrow();
  });

  test("listAdminAuditLogPage blättert mit fester Seitengröße statt einer unbegrenzten Abfrage", async () => {
    const db = await createTestDatabase();
    const actorId = await seedActor(db);
    for (let i = 0; i < 5; i++) {
      await insertAdminAuditLogEntry(db, {
        actorUserId: actorId,
        action: `action-${i}`,
        entityType: "user",
        entityId: `target-${i}`,
        before: null,
        after: null,
      });
    }

    const firstPage = await listAdminAuditLogPage(db, { limit: 2 });
    expect(firstPage.entries).toHaveLength(2);
    expect(firstPage.hasMore).toBe(true);
    // Neueste zuerst.
    expect(firstPage.entries[0]?.action).toBe("action-4");

    const secondPage = await listAdminAuditLogPage(db, { limit: 2, beforeSeq: firstPage.entries[1]!.seq });
    expect(secondPage.entries).toHaveLength(2);
    expect(secondPage.entries.map((e) => e.action)).toEqual(["action-2", "action-1"]);

    const thirdPage = await listAdminAuditLogPage(db, { limit: 2, beforeSeq: secondPage.entries[1]!.seq });
    expect(thirdPage.entries).toHaveLength(1);
    expect(thirdPage.hasMore).toBe(false);
  });

  test("countAdminAuditLog liefert die Gesamtzahl ohne alle Zeilen zu laden", async () => {
    const db = await createTestDatabase();
    const actorId = await seedActor(db);
    for (let i = 0; i < 3; i++) {
      await insertAdminAuditLogEntry(db, { actorUserId: actorId, action: `a-${i}`, entityType: "user", entityId: "t", before: null, after: null });
    }

    const { countAdminAuditLog } = await import("./admin-audit-log-repository");
    await expect(countAdminAuditLog(db)).resolves.toBe(3);
  });
});
