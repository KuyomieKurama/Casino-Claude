// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest";

/** server/admin/route-helpers.ts importiert seit der Logger-Umstellung @/lib/env, das
 * "server-only" importiert — außerhalb von Next.js wirft das immer, siehe lib/env.test.ts. */
vi.mock("server-only", () => ({}));

const requireAdminMock = vi.fn();
const { UnauthorizedError } = vi.hoisted(() => ({
  UnauthenticatedError: class UnauthenticatedError extends Error {},
  UnauthorizedError: class UnauthorizedError extends Error {},
}));

vi.mock("@/server/auth/guards", () => ({
  requireAdmin: (...args: unknown[]) => requireAdminMock(...args),
  UnauthenticatedError: class UnauthenticatedError extends Error {},
  UnauthorizedError,
}));
vi.mock("@/server/db/client", async () => {
  const { createTestDatabase } = await import("@/server/db/test-harness");
  const db = await createTestDatabase();
  return { db };
});

import { db } from "@/server/db/client";
import { user, session } from "@/server/db/auth-schema";
import { POST } from "./route";

function adminSession(id: string) {
  return { user: { id, email: `${id}@example.com`, name: "Admin", role: "admin", status: "active", isGuest: false }, sessionId: "s1", expiresAt: new Date() };
}

function context(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("POST /api/admin/users/[id]/sessions — Admin-Auftrag §3", () => {
  beforeEach(() => {
    requireAdminMock.mockReset();
  });

  test("Nicht-Admin erreicht die Route nicht — 403", async () => {
    requireAdminMock.mockRejectedValueOnce(new UnauthorizedError());
    const response = await POST(new Request("http://localhost/api/admin/users/target-1/sessions", { method: "POST" }), context("target-1"));
    expect(response.status).toBe(403);
  });

  test("widerruft alle Sitzungen eines Nutzers — 200", async () => {
    await db.insert(user).values({ id: "admin-1", name: "Admin", email: "admin@example.com", role: "admin", status: "active" });
    await db.insert(user).values({ id: "target-1", name: "T", email: "t@example.com", status: "active" });
    await db.insert(session).values([{ id: "s1", userId: "target-1", token: "t1", expiresAt: new Date(Date.now() + 3_600_000) }]);
    requireAdminMock.mockResolvedValueOnce(adminSession("admin-1"));

    const response = await POST(new Request("http://localhost/api/admin/users/target-1/sessions", { method: "POST" }), context("target-1"));

    expect(response.status).toBe(200);
    const body = (await response.json()) as { data: { revokedCount: number } };
    expect(body.data.revokedCount).toBe(1);
  });

  test("unbekannter Nutzer liefert 404", async () => {
    await db.insert(user).values({ id: "admin-2", name: "Admin", email: "admin2@example.com", role: "admin", status: "active" });
    requireAdminMock.mockResolvedValueOnce(adminSession("admin-2"));

    const response = await POST(new Request("http://localhost/api/admin/users/nope/sessions", { method: "POST" }), context("nope"));

    expect(response.status).toBe(404);
  });
});
