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
import { PgGameModeRepository } from "@/server/repositories/game-mode-repository";
import { POST } from "./route";

function adminSession(id: string) {
  return { user: { id, email: `${id}@example.com`, name: "Admin", role: "admin", status: "active", isGuest: false }, sessionId: "s1", expiresAt: new Date() };
}

/**
 * Eigene, treiberneutrale Seed-Hilfsfunktion statt `seedMinimalCatalog` (die ist auf
 * `TestDatabase`/PGlite getypt — der über `vi.mock` ersetzte `db`-Export bleibt statisch beim
 * `NodePgDatabase`-Typ, siehe ausführlicher Kommentar in listing/route.test.ts). Legt den Titel
 * direkt mit `status: "inactive"` an, damit der Aktivierungsversuch im Test unten tatsächlich
 * die Invariante prüft statt an einem No-Op ("active" -> "active") vorbeizulaufen.
 */
async function seedInactiveGame(id: string) {
  const providerId = `${id}-provider`;
  await db.insert(provider).values({ id: providerId, name: "Testanbieter" });
  await db.insert(game).values({
    id,
    slug: id,
    name: "Testspiel",
    category: "slots",
    providerId,
    description: "Nur für Tests.",
    status: "inactive",
    releasedAt: new Date("2025-01-01T00:00:00.000Z"),
    popularityScore: 0,
    sortOrder: 0,
  });
  return id;
}

function statusRequest(status: string): Request {
  return new Request("http://localhost/api/admin/games/x/status", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ status }) });
}

function context(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("POST /api/admin/games/[id]/status — Admin-Auftrag §2", () => {
  beforeEach(() => {
    requireAdminMock.mockReset();
  });

  test("Nicht-Admin erreicht die Route nicht — 403", async () => {
    requireAdminMock.mockRejectedValueOnce(new UnauthorizedError());
    const response = await POST(statusRequest("inactive"), context("g1"));
    expect(response.status).toBe(403);
  });

  test("Aktivieren eines Titels ohne aktiven Modus wird mit 409 abgelehnt", async () => {
    await db.insert(user).values({ id: "admin-1", name: "Admin", email: "admin@example.com", role: "admin", status: "active" });
    const gameId = await seedInactiveGame("test-game-1");
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
      status: "inactive",
    });
    requireAdminMock.mockResolvedValueOnce(adminSession("admin-1"));

    const response = await POST(statusRequest("active"), context(gameId));

    expect(response.status).toBe(409);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe("NO_ACTIVE_MODE");
  });

  test("ein ungültiger status-Wert wird mit 400 abgelehnt", async () => {
    requireAdminMock.mockResolvedValueOnce(adminSession("admin-1"));
    const response = await POST(statusRequest("archived"), context("g1"));
    expect(response.status).toBe(400);
  });
});
