// @vitest-environment node
import { beforeAll, describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

// Fester Seed für deterministische, exakt nachrechenbare Feldwahl (wie round-service.test.ts).
vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  return { ...actual, randomInt: vi.fn(() => 12345) };
});

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
import { seedMinimalCatalog, type TestDatabase } from "@/server/db/test-harness";
import { PgGameModeRepository } from "@/server/repositories/game-mode-repository";
import { user } from "@/server/db/auth-schema";
import { minePositions } from "@/components/game/engine/arcade/mines-logic";
import { startInteractiveRound } from "@/server/rounds/interactive-round-service";
import { POST } from "./route";

const testDb = db as unknown as TestDatabase;
let userCounter = 0;

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

function sessionFor(userId: string) {
  return { user: { id: userId, email: `${userId}@example.com`, name: "Test", role: "user", status: "active", isGuest: false } };
}

function postRequest(roundId: string, body: unknown): Request {
  return new Request(`http://localhost/api/rounds/${roundId}/actions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function callRoute(roundId: string, body: unknown): Promise<Response> {
  return POST(postRequest(roundId, body), { params: Promise.resolve({ id: roundId }) });
}

/**
 * Ein frischer Nutzer je Aufruf: Invariante 4 (höchstens eine offene Runde je Nutzer,
 * server/db/schema.ts::game_round_user_open_unique) würde sonst den zweiten Rundenstart in
 * einem späteren Test ablehnen, weil die Runde des vorherigen Tests noch offen ist.
 */
async function startMinesRound(idempotencyKey: string, stakeMinor = 100) {
  userCounter += 1;
  const userId = `member-${userCounter}`;
  await db.insert(user).values({ id: userId, name: "Mitglied", email: `${userId}@example.com` });
  const result = await startInteractiveRound(testDb, { userId, gameModeId: "g-mines-demo", stakeMinor, idempotencyKey, betId: "m3" });
  if (!result.ok || result.data.status !== "open") throw new Error("Testaufbau fehlgeschlagen.");
  return { ...result.data, userId };
}

describe("POST /api/rounds/:id/actions", () => {
  test("ohne Sitzung wird die Anfrage mit 401 und dem eigenständigen Code UNAUTHENTICATED abgelehnt", async () => {
    getSessionMock.mockResolvedValueOnce(null);

    const response = await callRoute("irgendeine-runde", { seq: 1, action: "reveal", payload: { cell: 0 } });

    expect(response.status).toBe(401);
    const body = (await response.json()) as { success: boolean; error?: string };
    expect(body).toEqual({ success: false, error: "UNAUTHENTICATED" });
  });

  test("eine gültige reveal-Aktion liefert eine offene Antwort ohne Minenpositionen", async () => {
    const round = await startMinesRound("route-k1");
    getSessionMock.mockResolvedValue(sessionFor(round.userId));
    // crypto.randomInt ist oben fest auf 12345 gemockt — die Feldwahl ist damit reproduzierbar.
    const positions = minePositions(12345, 3);
    const safeCell = [...Array(25).keys()].find((c) => !positions.includes(c))!;

    const response = await callRoute(round.roundId, { seq: 1, action: "reveal", payload: { cell: safeCell } });

    expect(response.status).toBe(200);
    const body = (await response.json()) as { success: boolean; data?: { status: string; state: unknown } };
    expect(body.success).toBe(true);
    expect(body.data?.status).toBe("open");
    expect(body.data?.state).not.toHaveProperty("positions");
    expect(body.data?.state).not.toHaveProperty("hitCell");
  });

  test("ein fehlerhafter Body wird mit 400 und INVALID_STAKE abgelehnt", async () => {
    const round = await startMinesRound("route-k2");
    getSessionMock.mockResolvedValue(sessionFor(round.userId));

    const response = await callRoute(round.roundId, { seq: 1 });

    expect(response.status).toBe(400);
    const body = (await response.json()) as { success: boolean; error?: string };
    expect(body).toEqual({ success: false, error: "INVALID_STAKE" });
  });

  test("eine Aktion auf einer fremden Runde wird abgelehnt", async () => {
    const round = await startMinesRound("route-k3");
    await db.insert(user).values({ id: "member-fremd", name: "Andere", email: "member-fremd@example.com" });
    getSessionMock.mockResolvedValueOnce(sessionFor("member-fremd"));

    const response = await callRoute(round.roundId, { seq: 1, action: "reveal", payload: { cell: 0 } });

    const body = (await response.json()) as { success: boolean; error?: string };
    expect(body).toEqual({ success: false, error: "NO_PENDING_ROUND" });
  });

  test("cashOut ohne aufgedecktes Feld wird abgelehnt", async () => {
    const round = await startMinesRound("route-k4");
    getSessionMock.mockResolvedValue(sessionFor(round.userId));

    const response = await callRoute(round.roundId, { seq: 1, action: "cashOut", payload: {} });

    const body = (await response.json()) as { success: boolean; error?: string };
    expect(body).toEqual({ success: false, error: "INVALID_STAKE" });
  });
});
