// @vitest-environment node
import { describe, expect, test } from "vitest";
import { createTestDatabase } from "@/server/db/test-harness";
import { user } from "@/server/db/auth-schema";
import { insertAdminAuditLogEntry } from "@/server/repositories/admin-audit-log-repository";
import { AUDIT_LOG_PAGE_SIZE, auditLogSearchParamsSchema, resolveAuditLogPage } from "./audit-log-read-model";

describe("auditLogSearchParamsSchema", () => {
  test("ohne Parameter: leere Cursor-Kette", () => {
    expect(auditLogSearchParamsSchema.parse({})).toEqual({ cursors: [] });
  });

  test("eine ungültige Cursor-Angabe fällt auf eine leere Kette zurück statt zu werfen", () => {
    expect(auditLogSearchParamsSchema.parse({ cursors: "abc,-1,0" })).toEqual({ cursors: [] });
  });

  test("gültige Cursor werden als Zahlen geparst", () => {
    expect(auditLogSearchParamsSchema.parse({ cursors: "5,3" })).toEqual({ cursors: [5, 3] });
  });
});

describe("resolveAuditLogPage — Admin-Auftrag §4 (keine unbegrenzte Abfrage)", () => {
  test("liefert höchstens AUDIT_LOG_PAGE_SIZE Einträge und markiert weitere Seiten", async () => {
    const db = await createTestDatabase();
    await db.insert(user).values({ id: "admin-1", name: "Admin", email: "admin@example.com", role: "admin" });
    for (let i = 0; i < AUDIT_LOG_PAGE_SIZE + 5; i++) {
      await insertAdminAuditLogEntry(db, { actorUserId: "admin-1", action: `a-${i}`, entityType: "user", entityId: "t", before: null, after: null });
    }

    const page = await resolveAuditLogPage(db, undefined);

    expect(page.entries).toHaveLength(AUDIT_LOG_PAGE_SIZE);
    expect(page.hasMore).toBe(true);
    expect(page.total).toBe(AUDIT_LOG_PAGE_SIZE + 5);
  });

  test("ein Cursor liefert die nächste Seite ohne Überschneidung", async () => {
    const db = await createTestDatabase();
    await db.insert(user).values({ id: "admin-1", name: "Admin", email: "admin@example.com", role: "admin" });
    for (let i = 0; i < 3; i++) {
      await insertAdminAuditLogEntry(db, { actorUserId: "admin-1", action: `a-${i}`, entityType: "user", entityId: "t", before: null, after: null });
    }

    const firstPage = await resolveAuditLogPage(db, undefined);
    const cursor = firstPage.entries.at(-1)?.seq;
    const secondPage = await resolveAuditLogPage(db, cursor);

    const overlap = secondPage.entries.some((e) => firstPage.entries.some((f) => f.id === e.id));
    expect(overlap).toBe(false);
  });
});
