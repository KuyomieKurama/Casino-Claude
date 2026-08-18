// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest";

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
import { POST } from "./route";

/**
 * Eigene Seed-Hilfsfunktion statt `server/db/test-harness.ts::seedMinimalCatalog`: Letztere ist
 * auf `TestDatabase` (den PGlite-spezifischen Drizzle-Typ) getypt. Der hier über `vi.mock`
 * ersetzte `db`-Export aus `@/server/db/client` bleibt statisch beim ursprünglichen
 * `NodePgDatabase`-Typ (nur der Laufzeitwert ist PGlite) — beide Treibertypen sind strukturell
 * NICHT austauschbar (unterschiedliche `QueryResultHKT`), deshalb hier direkte, treiberneutrale
 * `db.insert()`-Aufrufe statt der spezialisierten Hilfsfunktion.
 */
async function seedGame(id: string) {
  const providerId = `${id}-provider`;
  await db.insert(provider).values({ id: providerId, name: "Testanbieter" });
  await db.insert(game).values({
    id,
    slug: id,
    name: "Testspiel",
    category: "slots",
    providerId,
    description: "Nur für Tests.",
    status: "active",
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

describe("POST /api/admin/games/[id]/listing — Admin-Auftrag §2", () => {
  beforeEach(() => {
    requireAdminMock.mockReset();
  });

  test("Nicht-Admin erreicht die Route nicht — 403", async () => {
    requireAdminMock.mockRejectedValueOnce(new UnauthorizedError());
    const response = await POST(new Request("http://localhost/x", { method: "POST", body: JSON.stringify({ isFeatured: true }) }), context("g1"));
    expect(response.status).toBe(403);
  });

  test("aktualisiert isFeatured und sortOrder — 200", async () => {
    await db.insert(user).values({ id: "admin-1", name: "Admin", email: "admin@example.com", role: "admin", status: "active" });
    const gameId = await seedGame("test-game-1");
    requireAdminMock.mockResolvedValueOnce(adminSession("admin-1"));

    const response = await POST(
      new Request("http://localhost/x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ isFeatured: true, sortOrder: 3 }) }),
      context(gameId),
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { data: { game: { isFeatured: boolean; sortOrder: number } } };
    expect(body.data.game).toMatchObject({ isFeatured: true, sortOrder: 3 });
  });

  test("paytableKey im Body wird ignoriert — das Schema kennt dieses Feld nicht", async () => {
    await db.insert(user).values({ id: "admin-2", name: "Admin", email: "admin2@example.com", role: "admin", status: "active" });
    const gameId = await seedGame("test-game-2");
    requireAdminMock.mockResolvedValueOnce(adminSession("admin-2"));

    const response = await POST(
      new Request("http://localhost/x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ isFeatured: true, paytableKey: "hacked" }) }),
      context(gameId),
    );

    expect(response.status).toBe(200);
  });
});
