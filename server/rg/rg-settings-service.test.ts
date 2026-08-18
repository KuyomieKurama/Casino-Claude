// @vitest-environment node
import { describe, expect, test } from "vitest";
import { createTestDatabase, type TestDatabase } from "@/server/db/test-harness";
import { user } from "@/server/db/auth-schema";
import {
  activateSelfExclusionAction,
  confirmLiftSelfExclusionAction,
  endPause,
  markReminderShown,
  pauseSession,
  requestLiftSelfExclusionAction,
  setReminderInterval,
  setSessionLimit,
  startNewSession,
} from "./rg-settings-service";

async function seedUser(db: TestDatabase, id = "u1"): Promise<string> {
  await db.insert(user).values({ id, name: "Testnutzer", email: `${id}@example.com` });
  return id;
}

const t0 = "2026-08-15T10:00:00.000Z";
const plus = (iso: string, ms: number) => new Date(Date.parse(iso) + ms).toISOString();

describe("pauseSession / endPause", () => {
  test("pauseSession setzt pausedUntil relativ zu 'jetzt' und endPause entfernt es wieder", async () => {
    const db = await createTestDatabase();
    const userId = await seedUser(db);

    const paused = await pauseSession(db, userId, 15, t0);
    expect(paused.pausedUntil).toBe(plus(t0, 15 * 60_000));

    const ended = await endPause(db, userId, plus(t0, 60_000));
    expect(ended.pausedUntil).toBeUndefined();
  });
});

describe("setSessionLimit / setReminderInterval", () => {
  test("setSessionLimit(null) entfernt ein Limit wieder", async () => {
    const db = await createTestDatabase();
    const userId = await seedUser(db);
    await setSessionLimit(db, userId, 30, t0);

    const cleared = await setSessionLimit(db, userId, null, plus(t0, 60_000));

    expect(cleared.sessionLimitMinutes).toBeUndefined();
  });

  test("setReminderInterval ändert das Intervall", async () => {
    const db = await createTestDatabase();
    const userId = await seedUser(db);

    const updated = await setReminderInterval(db, userId, 15, t0);

    expect(updated.reminderIntervalMinutes).toBe(15);
  });
});

describe("markReminderShown / startNewSession", () => {
  test("markReminderShown setzt lastReminderAt auf die aktive Sitzung", async () => {
    const db = await createTestDatabase();
    const userId = await seedUser(db);

    const rg = await markReminderShown(db, userId, t0);

    expect(rg.lastReminderAt).toBe(t0);
  });

  test("startNewSession setzt sessionStartedAt sofort neu, auch ohne Lücke", async () => {
    const db = await createTestDatabase();
    const userId = await seedUser(db);
    await markReminderShown(db, userId, t0); // legt implizit eine Sitzung an

    const rg = await startNewSession(db, userId, plus(t0, 60_000));

    expect(rg.sessionStartedAt).toBe(plus(t0, 60_000));
  });
});

describe("Selbstsperre — wirkt sofort, Aufheben nur in zwei getrennten Aufrufen", () => {
  test("activateSelfExclusionAction wirkt mit einem einzigen Aufruf", async () => {
    const db = await createTestDatabase();
    const userId = await seedUser(db);

    const rg = await activateSelfExclusionAction(db, userId, t0);

    expect(rg.selfExcluded).toBe(true);
  });

  test("confirmLiftSelfExclusionAction OHNE vorherigen requestLiftSelfExclusionAction schlägt fehl", async () => {
    const db = await createTestDatabase();
    const userId = await seedUser(db);
    await activateSelfExclusionAction(db, userId, t0);

    const result = await confirmLiftSelfExclusionAction(db, userId, plus(t0, 60_000));

    expect(result).toEqual({ ok: false });
  });

  test("requestLiftSelfExclusionAction gefolgt von confirmLiftSelfExclusionAction hebt die Sperre auf", async () => {
    const db = await createTestDatabase();
    const userId = await seedUser(db);
    await activateSelfExclusionAction(db, userId, t0);

    const requested = await requestLiftSelfExclusionAction(db, userId, plus(t0, 60_000));
    expect(requested.ok).toBe(true);
    if (requested.ok) expect(requested.rg.selfExcluded).toBe(true); // noch gesperrt

    const confirmed = await confirmLiftSelfExclusionAction(db, userId, plus(t0, 120_000));
    expect(confirmed).toEqual({ ok: true, rg: expect.objectContaining({ selfExcluded: false }) });
  });

  test("requestLiftSelfExclusionAction ohne bestehende Sperre schlägt fehl", async () => {
    const db = await createTestDatabase();
    const userId = await seedUser(db);

    const result = await requestLiftSelfExclusionAction(db, userId, t0);

    expect(result).toEqual({ ok: false });
  });
});

describe("Autorisierung: jede Funktion nimmt userId als eigenen Parameter — nie aus einem gemeinsamen Objekt mit Fremddaten", () => {
  test("Aktionen für Nutzer A verändern die Einstellungen von Nutzer B nicht", async () => {
    const db = await createTestDatabase();
    const a = await seedUser(db, "u-a");
    const b = await seedUser(db, "u-b");

    await activateSelfExclusionAction(db, a, t0);
    const bRg = await setReminderInterval(db, b, 60, t0);

    expect(bRg.selfExcluded).toBe(false);
  });
});
