// @vitest-environment node
import { describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/server/db/client", async () => {
  const { createTestDatabase } = await import("@/server/db/test-harness");
  const db = await createTestDatabase();
  return { db };
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

describe("POST /api/rg/touch", () => {
  test("ohne Sitzung liefert Standardwerte, ohne ein Konto anzulegen", async () => {
    getSessionMock.mockResolvedValueOnce(null);

    const response = await POST();

    expect(response.status).toBe(200);
    const body = (await response.json()) as { success: boolean; data: { rg: { selfExcluded: boolean } } };
    expect(body.success).toBe(true);
    expect(body.data.rg.selfExcluded).toBe(false);
  });

  test("mit Sitzung schreibt die Spielsitzung fort und liefert den aktuellen RG-Zustand", async () => {
    await db.insert(user).values({ id: "member-1", name: "Mitglied", email: "member@example.com" });
    getSessionMock.mockResolvedValueOnce(sessionFor("member-1"));

    const response = await POST();

    expect(response.status).toBe(200);
    const body = (await response.json()) as { success: boolean; data: { rg: { sessionStartedAt: string } } };
    expect(body.success).toBe(true);
    expect(typeof body.data.rg.sessionStartedAt).toBe("string");
  });
});
