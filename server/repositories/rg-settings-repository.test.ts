// @vitest-environment node
import { describe, expect, test } from "vitest";
import { createTestDatabase, type TestDatabase } from "@/server/db/test-harness";
import { user } from "@/server/db/auth-schema";
import { RG_LIFT_CONFIRM_WINDOW_MS } from "@/lib/constants";
import {
  activateSelfExclusion,
  confirmLiftSelfExclusion,
  endPause,
  findOrCreateRgSettings,
  findRgSettings,
  requestLiftSelfExclusion,
  setPause,
  setReminderIntervalMinutes,
  setSessionLimitMinutes,
} from "./rg-settings-repository";

async function seedUser(db: TestDatabase, id = "u1"): Promise<string> {
  await db.insert(user).values({ id, name: "Testnutzer", email: `${id}@example.com` });
  return id;
}

const t0 = "2026-08-15T10:00:00.000Z";
const plus = (iso: string, ms: number) => new Date(Date.parse(iso) + ms).toISOString();

describe("findOrCreateRgSettings", () => {
  test("legt Standardwerte an (keine Sperre, kein Limit)", async () => {
    const db = await createTestDatabase();
    const userId = await seedUser(db);

    const settings = await findOrCreateRgSettings(db, userId);

    expect(settings).toMatchObject({ userId, sessionLimitMinutes: null, pausedUntil: null, selfExcluded: false, selfExcludedAt: null, liftRequestedAt: null });
  });

  test("ein zweiter Aufruf ändert nichts an einer bestehenden Zeile", async () => {
    const db = await createTestDatabase();
    const userId = await seedUser(db);
    await setSessionLimitMinutes(db, userId, 30);

    const settings = await findOrCreateRgSettings(db, userId);

    expect(settings.sessionLimitMinutes).toBe(30);
  });
});

describe("Autorisierung: nie eine fremde userId", () => {
  test("Einstellungen zweier Nutzer bleiben unabhängig — keine Vermischung", async () => {
    const db = await createTestDatabase();
    const a = await seedUser(db, "u-a");
    const b = await seedUser(db, "u-b");

    await activateSelfExclusion(db, a, t0);
    const bSettings = await findOrCreateRgSettings(db, b);

    expect(bSettings.selfExcluded).toBe(false);
    const aSettings = await findRgSettings(db, a);
    expect(aSettings?.selfExcluded).toBe(true);
  });
});

describe("Pause", () => {
  test("setPause setzt pausedUntil, endPause entfernt es wieder", async () => {
    const db = await createTestDatabase();
    const userId = await seedUser(db);

    const paused = await setPause(db, userId, plus(t0, 15 * 60_000));
    expect(paused.pausedUntil).toBe(plus(t0, 15 * 60_000));

    const ended = await endPause(db, userId);
    expect(ended.pausedUntil).toBeNull();
  });
});

describe("Zeitlimit und Erinnerungsintervall", () => {
  test("setSessionLimitMinutes(null) entfernt ein bestehendes Limit", async () => {
    const db = await createTestDatabase();
    const userId = await seedUser(db);
    await setSessionLimitMinutes(db, userId, 60);

    const cleared = await setSessionLimitMinutes(db, userId, null);

    expect(cleared.sessionLimitMinutes).toBeNull();
  });

  test("setReminderIntervalMinutes ändert das Intervall", async () => {
    const db = await createTestDatabase();
    const userId = await seedUser(db);

    const updated = await setReminderIntervalMinutes(db, userId, 15);

    expect(updated.reminderIntervalMinutes).toBe(15);
  });
});

describe("Selbstsperre — wirkt sofort, Aufheben nur in zwei getrennten Schritten", () => {
  test("activateSelfExclusion wirkt mit einem einzigen Aufruf", async () => {
    const db = await createTestDatabase();
    const userId = await seedUser(db);

    const activated = await activateSelfExclusion(db, userId, t0);

    expect(activated.selfExcluded).toBe(true);
    expect(activated.selfExcludedAt).toBe(t0);
  });

  test("confirmLiftSelfExclusion OHNE vorherigen requestLift hebt die Sperre NICHT auf", async () => {
    const db = await createTestDatabase();
    const userId = await seedUser(db);
    await activateSelfExclusion(db, userId, t0);

    const result = await confirmLiftSelfExclusion(db, userId, plus(t0, 60_000), RG_LIFT_CONFIRM_WINDOW_MS);

    expect(result).toBeNull();
    const stillExcluded = await findRgSettings(db, userId);
    expect(stillExcluded?.selfExcluded).toBe(true);
  });

  test("requestLiftSelfExclusion gefolgt von confirmLiftSelfExclusion innerhalb des Zeitfensters hebt die Sperre auf", async () => {
    const db = await createTestDatabase();
    const userId = await seedUser(db);
    await activateSelfExclusion(db, userId, t0);

    const requested = await requestLiftSelfExclusion(db, userId, plus(t0, 60_000));
    expect(requested?.selfExcluded).toBe(true); // noch gesperrt — nur der Antrag ist gestellt

    const confirmed = await confirmLiftSelfExclusion(db, userId, plus(t0, 120_000), RG_LIFT_CONFIRM_WINDOW_MS);

    expect(confirmed?.selfExcluded).toBe(false);
    expect(confirmed?.liftRequestedAt).toBeNull();
  });

  test("confirmLiftSelfExclusion außerhalb des Zeitfensters lehnt ab", async () => {
    const db = await createTestDatabase();
    const userId = await seedUser(db);
    await activateSelfExclusion(db, userId, t0);
    await requestLiftSelfExclusion(db, userId, plus(t0, 60_000));

    const tooLate = plus(t0, 60_000 + RG_LIFT_CONFIRM_WINDOW_MS + 1_000);
    const result = await confirmLiftSelfExclusion(db, userId, tooLate, RG_LIFT_CONFIRM_WINDOW_MS);

    expect(result).toBeNull();
    const stillExcluded = await findRgSettings(db, userId);
    expect(stillExcluded?.selfExcluded).toBe(true);
  });

  test("requestLiftSelfExclusion ohne bestehende Sperre meldet null (nichts aufzuheben)", async () => {
    const db = await createTestDatabase();
    const userId = await seedUser(db);

    const result = await requestLiftSelfExclusion(db, userId, t0);

    expect(result).toBeNull();
  });

  test("eine erneute Selbstsperre verwirft einen offenen Aufhebungsantrag", async () => {
    const db = await createTestDatabase();
    const userId = await seedUser(db);
    await activateSelfExclusion(db, userId, t0);
    await requestLiftSelfExclusion(db, userId, plus(t0, 60_000));

    await activateSelfExclusion(db, userId, plus(t0, 90_000));

    const confirmed = await confirmLiftSelfExclusion(db, userId, plus(t0, 120_000), RG_LIFT_CONFIRM_WINDOW_MS);
    expect(confirmed).toBeNull();
  });
});
