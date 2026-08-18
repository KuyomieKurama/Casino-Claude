// @vitest-environment node
import { describe, expect, test } from "vitest";
import { createTestDatabase, type TestDatabase } from "@/server/db/test-harness";
import { user } from "@/server/db/auth-schema";
import { activateSelfExclusion } from "@/server/repositories/rg-settings-repository";
import { touchPlaySession } from "@/server/repositories/play-session-repository";
import { DEFAULT_REMINDER_INTERVAL_MINUTES } from "@/lib/constants";
import { resolveResponsibleGaming } from "./rg-read-model";

async function seedUser(db: TestDatabase, id = "u1"): Promise<string> {
  await db.insert(user).values({ id, name: "Testnutzer", email: `${id}@example.com` });
  return id;
}

describe("resolveResponsibleGaming", () => {
  test("liefert für Gäste ohne Sitzung Standardwerte, ohne die Datenbank anzufassen", async () => {
    const db = await createTestDatabase();

    const rg = await resolveResponsibleGaming(db, null);

    expect(rg.selfExcluded).toBe(false);
    expect(rg.reminderIntervalMinutes).toBe(DEFAULT_REMINDER_INTERVAL_MINUTES);
    expect(rg.sessionLimitMinutes).toBeUndefined();
  });

  test("liefert für einen Nutzer ohne bisherige RG-Zeilen Standardwerte, OHNE eine Zeile anzulegen", async () => {
    const db = await createTestDatabase();
    const userId = await seedUser(db);

    const rg = await resolveResponsibleGaming(db, userId);
    expect(rg.selfExcluded).toBe(false);

    const { findRgSettings } = await import("@/server/repositories/rg-settings-repository");
    const settings = await findRgSettings(db, userId);
    expect(settings).toBeNull(); // reines Lesen legt nichts an
  });

  test("spiegelt eine bestehende Selbstsperre wider", async () => {
    const db = await createTestDatabase();
    const userId = await seedUser(db);
    await activateSelfExclusion(db, userId, "2026-08-15T10:00:00.000Z");

    const rg = await resolveResponsibleGaming(db, userId);

    expect(rg.selfExcluded).toBe(true);
  });

  test("spiegelt die aktive Sitzung wider, ohne last_active_at zu verändern (kein Touch)", async () => {
    const db = await createTestDatabase();
    const userId = await seedUser(db);
    const t0 = "2026-08-15T10:00:00.000Z";
    await touchPlaySession(db, userId, t0);

    const rg = await resolveResponsibleGaming(db, userId);

    expect(rg.sessionStartedAt).toBe(t0);
    const { findActiveSession } = await import("@/server/repositories/play-session-repository");
    const session = await findActiveSession(db, userId);
    expect(session?.lastActiveAt).toBe(t0); // unverändert
  });
});
