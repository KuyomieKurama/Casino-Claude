// @vitest-environment node
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, test, vi } from "vitest";

const requireAdminMock = vi.fn();

const { UnauthenticatedError, UnauthorizedError } = vi.hoisted(() => ({
  UnauthenticatedError: class UnauthenticatedError extends Error {},
  UnauthorizedError: class UnauthorizedError extends Error {},
}));

vi.mock("@/server/auth/guards", () => ({
  requireAdmin: (...args: unknown[]) => requireAdminMock(...args),
  UnauthenticatedError,
  UnauthorizedError,
}));
vi.mock("@/server/db/client", async () => {
  const { createTestDatabase } = await import("@/server/db/test-harness");
  const db = await createTestDatabase();
  return { db };
});

import { db } from "@/server/db/client";
import { user } from "@/server/db/auth-schema";
import { POST } from "./route";

function adminSession(id: string) {
  return { user: { id, email: `${id}@example.com`, name: "Admin", role: "admin", status: "active", isGuest: false }, sessionId: "s1", expiresAt: new Date() };
}

function statusRequest(body: unknown): Request {
  return new Request("http://localhost/api/admin/users/target-1/status", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function context(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("POST /api/admin/users/[id]/status — Admin-Auftrag §3", () => {
  beforeEach(() => {
    requireAdminMock.mockReset();
  });

  test("Nicht-Admin (UnauthorizedError) erreicht die Route nicht — 403, keine Änderung", async () => {
    await db.insert(user).values({ id: "target-1", name: "T", email: "t@example.com", status: "active" });
    requireAdminMock.mockRejectedValueOnce(new UnauthorizedError());

    const response = await POST(statusRequest({ status: "disabled" }), context("target-1"));

    expect(response.status).toBe(403);
    const [row] = await db.select().from(user).where(eq(user.id, "target-1"));
    expect(row?.status).toBe("active");
  });

  test("keine Sitzung (UnauthenticatedError) — 401", async () => {
    requireAdminMock.mockRejectedValueOnce(new UnauthenticatedError());

    const response = await POST(statusRequest({ status: "disabled" }), context("target-1"));

    expect(response.status).toBe(401);
  });

  test("ein Admin kann sich nicht selbst sperren — 409 SELF_LOCK_FORBIDDEN", async () => {
    await db.insert(user).values({ id: "admin-1", name: "Admin", email: "admin@example.com", role: "admin", status: "active" });
    requireAdminMock.mockResolvedValueOnce(adminSession("admin-1"));

    const response = await POST(statusRequest({ status: "disabled" }), context("admin-1"));

    expect(response.status).toBe(409);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe("SELF_LOCK_FORBIDDEN");
  });

  test("ein mitgeschicktes role-Feld hat keine Wirkung — das Schema kennt kein role-Feld", async () => {
    await db.insert(user).values({ id: "admin-2", name: "Admin", email: "admin2@example.com", role: "admin", status: "active" });
    await db.insert(user).values({ id: "target-2", name: "T2", email: "t2@example.com", role: "user", status: "active" });
    requireAdminMock.mockResolvedValueOnce(adminSession("admin-2"));

    const response = await POST(statusRequest({ status: "active", role: "admin" }), context("target-2"));

    expect(response.status).toBe(200);
    const [row] = await db.select().from(user).where(eq(user.id, "target-2"));
    expect(row?.role).toBe("user"); // unverändert — role wurde ignoriert, nicht übernommen
  });

  test("gültige Sperrung eines fremden Kontos gelingt — 200", async () => {
    await db.insert(user).values({ id: "admin-3", name: "Admin", email: "admin3@example.com", role: "admin", status: "active" });
    await db.insert(user).values({ id: "target-3", name: "T3", email: "t3@example.com", role: "user", status: "active" });
    requireAdminMock.mockResolvedValueOnce(adminSession("admin-3"));

    const response = await POST(statusRequest({ status: "disabled" }), context("target-3"));

    expect(response.status).toBe(200);
    const body = (await response.json()) as { success: boolean; data: { user: { status: string } } };
    expect(body.data.user.status).toBe("disabled");
  });

  test("ein ungültiger Body wird mit 400 abgelehnt", async () => {
    requireAdminMock.mockResolvedValueOnce(adminSession("admin-3"));

    const response = await POST(statusRequest({ status: "not-a-status" }), context("target-1"));

    expect(response.status).toBe(400);
  });
});
