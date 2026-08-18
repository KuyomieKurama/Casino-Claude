// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/server/db/client", async () => {
  const { createTestDatabase } = await import("@/server/db/test-harness");
  const db = await createTestDatabase();
  return { db };
});
vi.mock("@/server/auth", async () => {
  const { db } = await import("@/server/db/client");
  const { createAuth } = await import("@/server/auth/create-auth");
  return { auth: createAuth(db) };
});

const getSessionMock = vi.fn();
vi.mock("@/server/auth/guards", () => ({
  getSession: (...args: unknown[]) => getSessionMock(...args),
}));

import { db } from "@/server/db/client";
import { user } from "@/server/db/auth-schema";
import { POST } from "./route";

function sessionFor(userId: string) {
  return { user: { id: userId, email: `${userId}@example.com`, name: "Test", role: "user", status: "active", isGuest: false } };
}

function postRequest(body: unknown): Request {
  return new Request("http://localhost/api/rg/settings", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/rg/settings", () => {
  // Ein Testfall, dessen Anfrage bereits an der Schema-Prüfung scheitert, ruft getSession() nie
  // auf — ein per mockResolvedValueOnce() vorgemerkter Wert bliebe sonst in der Warteschlange und
  // würde fälschlich im NÄCHSTEN Test verbraucht (Tests müssen unabhängig voneinander sein).
  beforeEach(() => {
    getSessionMock.mockReset();
  });

  test("ohne Sitzung legt ein Gastkonto an und setzt ein Sitzungscookie", async () => {
    getSessionMock.mockResolvedValueOnce(null);

    const response = await POST(postRequest({ action: "setReminderInterval", minutes: 15 }));

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("session_token");
    const body = (await response.json()) as { success: boolean; data: { rg: { reminderIntervalMinutes: number } } };
    expect(body.data.rg.reminderIntervalMinutes).toBe(15);
  });

  test("pause setzt pausedUntil, endPause entfernt es wieder", async () => {
    await db.insert(user).values({ id: "member-1", name: "Mitglied", email: "member@example.com" });
    getSessionMock.mockResolvedValueOnce(sessionFor("member-1"));
    const paused = await POST(postRequest({ action: "pause", minutes: 15 }));
    const pausedBody = (await paused.json()) as { data: { rg: { pausedUntil?: string } } };
    expect(pausedBody.data.rg.pausedUntil).toBeTruthy();

    getSessionMock.mockResolvedValueOnce(sessionFor("member-1"));
    const ended = await POST(postRequest({ action: "endPause" }));
    const endedBody = (await ended.json()) as { data: { rg: { pausedUntil?: string } } };
    expect(endedBody.data.rg.pausedUntil).toBeUndefined();
  });

  test("ein fehlerhafter Body wird mit 400 und INVALID_INPUT abgelehnt", async () => {
    getSessionMock.mockResolvedValueOnce(sessionFor("member-1"));

    const response = await POST(postRequest({ action: "pause", minutes: -5 }));

    expect(response.status).toBe(400);
    const body = (await response.json()) as { success: boolean; error?: string };
    expect(body).toEqual({ success: false, error: "INVALID_INPUT" });
  });

  test("ein unbekannter Aktionsname wird mit 400 abgelehnt", async () => {
    getSessionMock.mockResolvedValueOnce(sessionFor("member-1"));

    const response = await POST(postRequest({ action: "deleteEverything" }));

    expect(response.status).toBe(400);
  });

  test("Autorisierung: eine mitgeschickte fremde userId im Body hat keine Wirkung — es zählt ausschließlich die Sitzung", async () => {
    await db.insert(user).values({ id: "member-a", name: "A", email: "a@example.com" });
    await db.insert(user).values({ id: "member-b", name: "B", email: "b@example.com" });
    getSessionMock.mockResolvedValueOnce(sessionFor("member-a"));

    // Das Schema kennt gar kein userId-Feld — ein solcher Versuch wird stillschweigend verworfen,
    // nicht etwa als Ziel für die Änderung übernommen.
    await POST(postRequest({ action: "setSessionLimit", minutes: 30, userId: "member-b" }));

    const { findRgSettings } = await import("@/server/repositories/rg-settings-repository");
    const bSettings = await findRgSettings(db, "member-b");
    expect(bSettings).toBeNull(); // Nutzer B ist unberührt
    const aSettings = await findRgSettings(db, "member-a");
    expect(aSettings?.sessionLimitMinutes).toBe(30);
  });
});
