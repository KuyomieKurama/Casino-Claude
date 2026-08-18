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
  return new Request("http://localhost/api/rg/self-exclusion", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/rg/self-exclusion", () => {
  // Siehe app/api/rg/settings/route.test.ts: verhindert, dass ein per mockResolvedValueOnce()
  // vorgemerkter, aber nie konsumierter Sitzungswert im nächsten Test verbraucht wird.
  beforeEach(() => {
    getSessionMock.mockReset();
  });

  // Wie app/api/rg/settings/route.test.ts: kein Gastkonto mehr, ohne Sitzung wird mit 401 und
  // UNAUTHENTICATED abgelehnt.
  test("ohne Sitzung wird mit 401 und UNAUTHENTICATED abgelehnt", async () => {
    getSessionMock.mockResolvedValueOnce(null);

    const response = await POST(postRequest({ action: "activate" }));

    expect(response.status).toBe(401);
    const body = (await response.json()) as { success: boolean; error?: string };
    expect(body).toEqual({ success: false, error: "UNAUTHENTICATED" });
  });

  test("activate wirkt sofort mit einem einzigen Aufruf", async () => {
    await db.insert(user).values({ id: "member-1", name: "Mitglied", email: "member@example.com" });
    getSessionMock.mockResolvedValueOnce(sessionFor("member-1"));

    const response = await POST(postRequest({ action: "activate" }));

    expect(response.status).toBe(200);
    const body = (await response.json()) as { success: boolean; data: { rg: { selfExcluded: boolean } } };
    expect(body.data.rg.selfExcluded).toBe(true);
  });

  test("ein einzelner confirmLift-Aufruf OHNE vorausgehenden requestLift hebt die Sperre NICHT auf — das ist der eigentliche Schutz vor einem direkten API-Aufruf unter Umgehung des Zwei-Schritt-Dialogs", async () => {
    await db.insert(user).values({ id: "member-2", name: "Mitglied", email: "member2@example.com" });
    getSessionMock.mockResolvedValueOnce(sessionFor("member-2"));
    await POST(postRequest({ action: "activate" }));

    getSessionMock.mockResolvedValueOnce(sessionFor("member-2"));
    const response = await POST(postRequest({ action: "confirmLift" }));

    const body = (await response.json()) as { success: boolean; error?: string };
    expect(body).toEqual({ success: false, error: "LIFT_NOT_CONFIRMABLE" });

    getSessionMock.mockResolvedValueOnce(sessionFor("member-2"));
    const statusResponse = await POST(postRequest({ action: "requestLift" }));
    const statusBody = (await statusResponse.json()) as { data: { rg: { selfExcluded: boolean } } };
    expect(statusBody.data.rg.selfExcluded).toBe(true); // weiterhin gesperrt
  });

  test("requestLift gefolgt von einem separaten confirmLift-Aufruf hebt die Sperre auf", async () => {
    await db.insert(user).values({ id: "member-3", name: "Mitglied", email: "member3@example.com" });
    getSessionMock.mockResolvedValueOnce(sessionFor("member-3"));
    await POST(postRequest({ action: "activate" }));

    getSessionMock.mockResolvedValueOnce(sessionFor("member-3"));
    await POST(postRequest({ action: "requestLift" }));

    getSessionMock.mockResolvedValueOnce(sessionFor("member-3"));
    const response = await POST(postRequest({ action: "confirmLift" }));

    const body = (await response.json()) as { success: boolean; data: { rg: { selfExcluded: boolean } } };
    expect(body).toEqual({ success: true, data: { rg: expect.objectContaining({ selfExcluded: false }) } });
  });

  test("Autorisierung: die Selbstsperre eines fremden Nutzers lässt sich nicht über die eigene Sitzung aufheben", async () => {
    await db.insert(user).values({ id: "member-a", name: "A", email: "a@example.com" });
    await db.insert(user).values({ id: "member-b", name: "B", email: "b@example.com" });
    getSessionMock.mockResolvedValueOnce(sessionFor("member-a"));
    await POST(postRequest({ action: "activate" }));

    // Nutzer B versucht (mit SEINER eigenen Sitzung — es gibt kein Feld, über das er die
    // Zielperson wählen könnte), Nutzer As Sperre aufzuheben. Es wirkt ausschließlich auf B.
    getSessionMock.mockResolvedValueOnce(sessionFor("member-b"));
    await POST(postRequest({ action: "requestLift" }));
    getSessionMock.mockResolvedValueOnce(sessionFor("member-b"));
    await POST(postRequest({ action: "confirmLift" }));

    const { findRgSettings } = await import("@/server/repositories/rg-settings-repository");
    const aSettings = await findRgSettings(db, "member-a");
    expect(aSettings?.selfExcluded).toBe(true); // unverändert gesperrt
  });

  test("ein unbekannter Aktionsname wird mit 400 abgelehnt", async () => {
    getSessionMock.mockResolvedValueOnce(sessionFor("member-1"));

    const response = await POST(postRequest({ action: "lift" }));

    expect(response.status).toBe(400);
  });
});
