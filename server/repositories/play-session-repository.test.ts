// @vitest-environment node
import { describe, expect, test } from "vitest";
import { createTestDatabase, type TestDatabase } from "@/server/db/test-harness";
import { user } from "@/server/db/auth-schema";
import { SESSION_GAP_MS } from "@/lib/responsible-gaming";
import { findActiveSession, forceNewSession, markReminderShown, touchPlaySession } from "./play-session-repository";

async function seedUser(db: TestDatabase, id = "u1"): Promise<string> {
  await db.insert(user).values({ id, name: "Testnutzer", email: `${id}@example.com` });
  return id;
}

const t0 = "2026-08-15T10:00:00.000Z";
const plus = (iso: string, ms: number) => new Date(Date.parse(iso) + ms).toISOString();

describe("touchPlaySession", () => {
  test("legt beim ersten Aufruf eine neue Sitzung an", async () => {
    const db = await createTestDatabase();
    const userId = await seedUser(db);

    const session = await touchPlaySession(db, userId, t0);

    expect(session).toMatchObject({ userId, startedAt: t0, lastActiveAt: t0, endedAt: null });
  });

  test("schreibt innerhalb der Lücke dieselbe Sitzung fort (startedAt bleibt gleich)", async () => {
    const db = await createTestDatabase();
    const userId = await seedUser(db);
    const first = await touchPlaySession(db, userId, t0);

    const second = await touchPlaySession(db, userId, plus(t0, 10 * 60_000));

    expect(second.id).toBe(first.id);
    expect(second.startedAt).toBe(t0);
    expect(second.lastActiveAt).toBe(plus(t0, 10 * 60_000));
  });

  test("eine Lücke von mehr als SESSION_GAP_MS beginnt eine neue Sitzung — dieselbe Aussage wie früher state/rg-reducer.test.ts", async () => {
    const db = await createTestDatabase();
    const userId = await seedUser(db);
    const first = await touchPlaySession(db, userId, t0);

    const late = plus(t0, SESSION_GAP_MS + 60_000);
    const second = await touchPlaySession(db, userId, late);

    expect(second.id).not.toBe(first.id);
    expect(second.startedAt).toBe(late);
    expect(second.lastActiveAt).toBe(late);

    // Die alte Sitzung wurde geschlossen (ended_at gesetzt), nicht gelöscht.
    const active = await findActiveSession(db, userId);
    expect(active?.id).toBe(second.id);
  });

  test("eine Lücke von genau SESSION_GAP_MS zählt noch nicht als Abwesenheit (Grenzfall wie getRgStatus)", async () => {
    const db = await createTestDatabase();
    const userId = await seedUser(db);
    const first = await touchPlaySession(db, userId, t0);

    const exact = plus(t0, SESSION_GAP_MS);
    const second = await touchPlaySession(db, userId, exact);

    expect(second.id).toBe(first.id);
    expect(second.startedAt).toBe(t0);
  });

  test("zwei gleichzeitige erste Aufrufe für denselben Nutzer legen nur eine aktive Sitzung an", async () => {
    const db = await createTestDatabase();
    const userId = await seedUser(db);

    const [a, b] = await Promise.all([touchPlaySession(db, userId, t0), touchPlaySession(db, userId, t0)]);

    expect(a.id).toBe(b.id);
  });
});

describe("forceNewSession", () => {
  test("beginnt sofort eine neue Sitzung, auch ohne Lücke", async () => {
    const db = await createTestDatabase();
    const userId = await seedUser(db);
    const first = await touchPlaySession(db, userId, t0);

    const forced = await forceNewSession(db, userId, plus(t0, 60_000));

    expect(forced.id).not.toBe(first.id);
    expect(forced.startedAt).toBe(plus(t0, 60_000));
  });
});

describe("markReminderShown", () => {
  test("setzt lastReminderAt auf der aktiven Sitzung", async () => {
    const db = await createTestDatabase();
    const userId = await seedUser(db);
    await touchPlaySession(db, userId, t0);

    const updated = await markReminderShown(db, userId, plus(t0, 60_000));

    expect(updated?.lastReminderAt).toBe(plus(t0, 60_000));
  });

  test("ohne aktive Sitzung liefert null", async () => {
    const db = await createTestDatabase();
    const userId = await seedUser(db);

    const updated = await markReminderShown(db, userId, t0);

    expect(updated).toBeNull();
  });
});

describe("Autorisierung: Sitzungen zweier Nutzer bleiben getrennt", () => {
  test("touchPlaySession für Nutzer A verändert keine Sitzung von Nutzer B", async () => {
    const db = await createTestDatabase();
    const a = await seedUser(db, "u-a");
    const b = await seedUser(db, "u-b");
    await touchPlaySession(db, b, t0);

    await touchPlaySession(db, a, plus(t0, 60_000));

    const bSession = await findActiveSession(db, b);
    expect(bSession?.lastActiveAt).toBe(t0);
  });
});
