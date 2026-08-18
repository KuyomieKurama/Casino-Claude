// @vitest-environment node
import { beforeAll, describe, expect, test, vi } from "vitest";

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

import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { seedMinimalCatalog, type TestDatabase } from "@/server/db/test-harness";
import { PgGameModeRepository } from "@/server/repositories/game-mode-repository";
import { user } from "@/server/db/auth-schema";
import { POST } from "./route";

const testDb = db as unknown as TestDatabase;

beforeAll(async () => {
  const { gameId } = await seedMinimalCatalog(testDb);
  const modeRepo = new PgGameModeRepository(db);
  await modeRepo.upsert({
    id: "g-mines-demo",
    gameId,
    key: "standard",
    label: "Standard",
    kind: "variant",
    engineKey: "mines",
    paytableKey: null,
    minBetMinor: 10,
    maxBetMinor: 100_000,
    isLivePresentation: false,
    isDefault: true,
    sortOrder: 0,
    status: "active",
  });
});

function postRequest(body: unknown): Request {
  return new Request("http://localhost/api/rounds/interactive-start", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/rounds/interactive-start", () => {
  test("ohne Sitzung: legt ein Gastkonto an, bucht den Einsatz und liefert eine offene Runde ohne Minenpositionen", async () => {
    getSessionMock.mockResolvedValueOnce(null);

    const response = await POST(postRequest({ gameModeId: "g-mines-demo", stakeMinor: 100, idempotencyKey: "guest-round-1", betId: "m3" }));

    expect(response.status).toBe(200);
    const body = (await response.json()) as { success: boolean; data?: { status: string; state: unknown } };
    expect(body.success).toBe(true);
    expect(body.data?.status).toBe("open");
    expect(body.data?.state).not.toHaveProperty("positions");
    expect(response.headers.get("set-cookie")).toContain("session_token");

    const guests = await db.select().from(user).where(eq(user.isGuest, true));
    expect(guests.length).toBeGreaterThan(0);
  });

  test("mit gültiger Sitzung: bucht die Runde auf das angemeldete Konto und setzt kein Cookie", async () => {
    await db.insert(user).values({ id: "member-1", name: "Mitglied", email: "member@example.com" });
    getSessionMock.mockResolvedValueOnce({ user: { id: "member-1", email: "member@example.com", name: "Mitglied", role: "user", status: "active", isGuest: false } });

    const response = await POST(postRequest({ gameModeId: "g-mines-demo", stakeMinor: 100, idempotencyKey: "member-round-1", betId: "m3" }));

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  test("lehnt einen fehlerhaften Body mit 400 und INVALID_STAKE ab", async () => {
    const response = await POST(postRequest({ gameModeId: "g-mines-demo" }));

    expect(response.status).toBe(400);
    const body = (await response.json()) as { success: boolean; error?: string };
    expect(body).toEqual({ success: false, error: "INVALID_STAKE" });
  });

  test("ein mitgeschickter returnMinor oder seed im Body hat keine Wirkung (unbekannte Felder werden verworfen)", async () => {
    getSessionMock.mockResolvedValueOnce(null);

    const response = await POST(
      postRequest({ gameModeId: "g-mines-demo", stakeMinor: 100, idempotencyKey: "tamper-round-1", betId: "m3", returnMinor: 999_999_999, seed: 1 }),
    );

    const body = (await response.json()) as { success: boolean; data?: { status: string } };
    expect(body.success).toBe(true);
    expect(body.data?.status).toBe("open");
  });

  test("unbekannter Spielmodus wird abgelehnt", async () => {
    getSessionMock.mockResolvedValueOnce(null);

    const response = await POST(postRequest({ gameModeId: "unbekannt", stakeMinor: 100, idempotencyKey: "unknown-mode-1" }));

    const body = (await response.json()) as { success: boolean; error?: string };
    expect(body).toEqual({ success: false, error: "INVALID_STAKE" });
  });
});
