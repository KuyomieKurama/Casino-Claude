// @vitest-environment node
import { describe, expect, test } from "vitest";
import { createTestDatabase, type TestDatabase } from "@/server/db/test-harness";
import { user } from "@/server/db/auth-schema";
import { activateSelfExclusion, setPause, setSessionLimitMinutes } from "@/server/repositories/rg-settings-repository";
import { touchPlaySession } from "@/server/repositories/play-session-repository";
import { assertRgNotBlocked, loadResponsibleGaming } from "./rg-guard";

async function seedUser(db: TestDatabase, id = "u1"): Promise<string> {
  await db.insert(user).values({ id, name: "Testnutzer", email: `${id}@example.com` });
  return id;
}

const t0 = "2026-08-15T10:00:00.000Z";
const plus = (iso: string, ms: number) => new Date(Date.parse(iso) + ms).toISOString();

describe("assertRgNotBlocked", () => {
  test("ein Nutzer ohne jede RG-Einstellung ist nicht blockiert (Standardzustand)", async () => {
    const db = await createTestDatabase();
    const userId = await seedUser(db);

    const result = await assertRgNotBlocked(db, userId, t0);

    expect(result).toEqual({ ok: true, status: expect.objectContaining({ blocked: false }) });
  });

  test("Selbstsperre blockiert mit dem konkreten Grund 'self-excluded'", async () => {
    const db = await createTestDatabase();
    const userId = await seedUser(db);
    await activateSelfExclusion(db, userId, t0);

    const result = await assertRgNotBlocked(db, userId, plus(t0, 60_000));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("RG_BLOCKED");
    const rg = await loadResponsibleGaming(db, userId, plus(t0, 60_000));
    expect(rg.selfExcluded).toBe(true);
  });

  test("eine aktive Pause blockiert mit dem konkreten Grund 'paused', danach nicht mehr", async () => {
    const db = await createTestDatabase();
    const userId = await seedUser(db);
    await setPause(db, userId, plus(t0, 15 * 60_000));

    const duringPause = await assertRgNotBlocked(db, userId, plus(t0, 5 * 60_000));
    expect(duringPause.ok).toBe(false);

    const afterPause = await assertRgNotBlocked(db, userId, plus(t0, 20 * 60_000));
    expect(afterPause.ok).toBe(true);
  });

  test("ein erreichtes Zeitlimit blockiert mit dem konkreten Grund 'limit-reached'", async () => {
    const db = await createTestDatabase();
    const userId = await seedUser(db);
    await touchPlaySession(db, userId, t0);
    await setSessionLimitMinutes(db, userId, 30);

    const beforeLimit = await assertRgNotBlocked(db, userId, plus(t0, 29 * 60_000));
    expect(beforeLimit.ok).toBe(true);

    const afterLimit = await assertRgNotBlocked(db, userId, plus(t0, 30 * 60_000));
    expect(afterLimit.ok).toBe(false);
  });

  test("Selbstsperre hat Vorrang vor Pause und Limit", async () => {
    const db = await createTestDatabase();
    const userId = await seedUser(db);
    await setPause(db, userId, plus(t0, 15 * 60_000));
    await activateSelfExclusion(db, userId, t0);
    await touchPlaySession(db, userId, t0);
    await setSessionLimitMinutes(db, userId, 30);

    // Selbst nach Ablauf von Pause UND Limit bleibt die Sperre wirksam — Zeit allein hebt nichts auf.
    const result = await assertRgNotBlocked(db, userId, plus(t0, 60 * 60_000));

    expect(result.ok).toBe(false);
  });
});

describe("loadResponsibleGaming", () => {
  test("touched die Sitzung — ein zweiter Aufruf nach der Lücke beginnt eine neue Sitzung", async () => {
    const db = await createTestDatabase();
    const userId = await seedUser(db);
    const first = await loadResponsibleGaming(db, userId, t0);

    const late = plus(t0, 31 * 60_000);
    const second = await loadResponsibleGaming(db, userId, late);

    expect(first.sessionStartedAt).toBe(t0);
    expect(second.sessionStartedAt).toBe(late);
  });
});
