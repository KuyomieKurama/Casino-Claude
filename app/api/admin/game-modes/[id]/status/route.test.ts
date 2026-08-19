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
import { user } from "@/server/db/auth-schema";
import { provider, game } from "@/server/db/schema";
import { PgGameModeRepository } from "@/server/repositories/game-mode-repository";
import { POST } from "./route";

/** Treiberneutrale Seed-Hilfsfunktion — Begründung siehe listing/route.test.ts. */
async function seedGame(id: string, status: "active" | "inactive" = "active") {
  const providerId = `${id}-provider`;
  await db.insert(provider).values({ id: providerId, name: "Testanbieter" });
  await db.insert(game).values({
    id,
    slug: id,
    name: "Testspiel",
    category: "slots",
    providerId,
    description: "Nur für Tests.",
    status,
    releasedAt: new Date("2025-01-01T00:00:00.000Z"),
    popularityScore: 0,
    sortOrder: 0,
  });
  return id;
}

function adminSession(id: string) {
  return { user: { id, email: `${id}@example.com`, name: "Admin", role: "admin", status: "active", isGuest: false }, sessionId: "s1", expiresAt: new Date() };
}

function context(id: string) {
  return { params: Promise.resolve({ id }) };
}

function statusRequest(status: string): Request {
  return new Request("http://localhost/x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ status }) });
}

describe("POST /api/admin/game-modes/[id]/status — Admin-Auftrag §2", () => {
  beforeEach(() => {
    requireAdminMock.mockReset();
  });

  test("Nicht-Admin erreicht die Route nicht — 403", async () => {
    requireAdminMock.mockRejectedValueOnce(new UnauthorizedError());
    const response = await POST(statusRequest("inactive"), context("m1"));
    expect(response.status).toBe(403);
  });

  test("den letzten aktiven Modus eines aktiven Titels deaktivieren wird mit 409 abgelehnt", async () => {
    await db.insert(user).values({ id: "admin-1", name: "Admin", email: "admin@example.com", role: "admin", status: "active" });
    const gameId = await seedGame("test-game-1", "active");
    await new PgGameModeRepository(db).upsert({
      id: "mode-1",
      gameId,
      key: "k",
      label: "K",
      kind: "variant",
      engineKey: "slot",
      paytableKey: null,
      minBetMinor: 10,
      maxBetMinor: 100,
      isLivePresentation: false,
      isDefault: true,
      sortOrder: 0,
      status: "active",
    });
    requireAdminMock.mockResolvedValueOnce(adminSession("admin-1"));

    const response = await POST(statusRequest("inactive"), context("mode-1"));

    expect(response.status).toBe(409);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe("LAST_ACTIVE_MODE_OF_ACTIVE_GAME");
  });
});
