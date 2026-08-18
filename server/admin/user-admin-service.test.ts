// @vitest-environment node
import { describe, expect, test } from "vitest";
import { createTestDatabase } from "@/server/db/test-harness";
import { user, session } from "@/server/db/auth-schema";
import { listAdminAuditLogPage } from "@/server/repositories/admin-audit-log-repository";
import { revokeUserSessions, setUserStatus } from "./user-admin-service";

async function seedUser(db: Awaited<ReturnType<typeof createTestDatabase>>, id: string, overrides: Partial<{ role: "user" | "admin"; status: "active" | "disabled" }> = {}) {
  await db.insert(user).values({ id, name: id, email: `${id}@example.com`, ...overrides });
}

describe("setUserStatus — Admin-Auftrag §3", () => {
  test("ein Admin kann sich nicht selbst sperren", async () => {
    const db = await createTestDatabase();
    await seedUser(db, "admin-1", { role: "admin", status: "active" });

    const result = await setUserStatus(db, "admin-1", "admin-1", "disabled");

    expect(result).toEqual({ ok: false, reason: "SELF_LOCK_FORBIDDEN" });
    const [row] = await db.select().from(user);
    expect(row?.status).toBe("active"); // unverändert
  });

  test("ein Admin kann sich selbst wieder entsperren (kein Selbstsperr-Verbot bei active)", async () => {
    const db = await createTestDatabase();
    await seedUser(db, "admin-1", { role: "admin", status: "disabled" });

    const result = await setUserStatus(db, "admin-1", "admin-1", "active");

    expect(result.ok).toBe(true);
  });

  test("unbekannter Zielnutzer liefert NOT_FOUND", async () => {
    const db = await createTestDatabase();
    await seedUser(db, "admin-1", { role: "admin", status: "active" });

    const result = await setUserStatus(db, "admin-1", "does-not-exist", "disabled");

    expect(result).toEqual({ ok: false, reason: "NOT_FOUND" });
  });

  test("sperrt ein anderes Konto und schreibt genau einen Audit-Eintrag", async () => {
    const db = await createTestDatabase();
    await seedUser(db, "admin-1", { role: "admin", status: "active" });
    await seedUser(db, "member-1", { role: "user", status: "active" });

    const result = await setUserStatus(db, "admin-1", "member-1", "disabled");

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.user.status).toBe("disabled");

    const { entries } = await listAdminAuditLogPage(db, { limit: 10 });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ actorUserId: "admin-1", action: "user.status.update", entityType: "user", entityId: "member-1" });
  });

  test("ein Aufruf ohne tatsächliche Änderung (Status bereits gesetzt) schreibt KEINEN neuen Audit-Eintrag", async () => {
    const db = await createTestDatabase();
    await seedUser(db, "admin-1", { role: "admin", status: "active" });
    await seedUser(db, "member-1", { role: "user", status: "active" });

    await setUserStatus(db, "admin-1", "member-1", "active");

    const { entries } = await listAdminAuditLogPage(db, { limit: 10 });
    expect(entries).toHaveLength(0);
  });
});

describe("revokeUserSessions — Admin-Auftrag §3", () => {
  test("widerruft alle Sitzungen und schreibt genau einen Audit-Eintrag", async () => {
    const db = await createTestDatabase();
    await seedUser(db, "admin-1", { role: "admin", status: "active" });
    await seedUser(db, "member-1", { role: "user", status: "active" });
    await db.insert(session).values([
      { id: "s1", userId: "member-1", token: "t1", expiresAt: new Date(Date.now() + 3_600_000) },
      { id: "s2", userId: "member-1", token: "t2", expiresAt: new Date(Date.now() + 3_600_000) },
    ]);

    const result = await revokeUserSessions(db, "admin-1", "member-1");

    expect(result).toEqual({ ok: true, revokedCount: 2 });
    const remaining = await db.select().from(session);
    expect(remaining).toHaveLength(0);

    const { entries } = await listAdminAuditLogPage(db, { limit: 10 });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ action: "user.sessions.revoke", entityId: "member-1" });
  });

  test("unbekannter Zielnutzer liefert NOT_FOUND, kein Audit-Eintrag", async () => {
    const db = await createTestDatabase();
    await seedUser(db, "admin-1", { role: "admin", status: "active" });

    const result = await revokeUserSessions(db, "admin-1", "does-not-exist");

    expect(result).toEqual({ ok: false, reason: "NOT_FOUND" });
    const { entries } = await listAdminAuditLogPage(db, { limit: 10 });
    expect(entries).toHaveLength(0);
  });
});
