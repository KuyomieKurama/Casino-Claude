// @vitest-environment node
import { describe, expect, test } from "vitest";
import { createTestDatabase, seedMinimalCatalog, type TestDatabase } from "@/server/db/test-harness";
import { user } from "@/server/db/auth-schema";
import { PgGameModeRepository } from "./game-mode-repository";
import { insertOpenRound } from "./game-round-repository";
import { findActionsForRound, insertRoundAction } from "./game-round-action-repository";

/**
 * Repository-Tests für das Aktionsprotokoll interaktiver Runden (Phase 3b, Auftrag §1).
 * Append-only — es gibt bewusst keinen Update-/Delete-Test, weil es keine solche Funktion gibt.
 */

async function seedRound(db: TestDatabase): Promise<string> {
  const { gameId } = await seedMinimalCatalog(db);
  const modeRepo = new PgGameModeRepository(db);
  const mode = await modeRepo.upsert({
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
  const userId = "u1";
  await db.insert(user).values({ id: userId, name: "Testnutzer", email: "u1@example.com" });
  const round = await insertOpenRound(db, {
    id: "r1",
    userId,
    gameModeId: mode.id,
    betKey: "m3",
    stakeMinor: 100,
    seed: 1,
    maxReturnMinor: 100_000,
    idempotencyKey: "k1",
    transcript: { engine: "mines" },
  });
  if (!round) throw new Error("Testaufbau fehlgeschlagen: Runde konnte nicht angelegt werden.");
  return round.id;
}

describe("game-round-action-repository", () => {
  test("insertRoundAction legt eine Aktion an und findActionsForRound liefert sie in Reihenfolge", async () => {
    const db = await createTestDatabase();
    const roundId = await seedRound(db);

    await insertRoundAction(db, { id: "a1", roundId, seq: 1, action: "reveal", payload: { cell: 3 } });
    await insertRoundAction(db, { id: "a2", roundId, seq: 2, action: "reveal", payload: { cell: 7 } });

    const actions = await findActionsForRound(db, roundId);
    expect(actions.map((a) => a.seq)).toEqual([1, 2]);
    expect(actions[0]?.action).toBe("reveal");
    expect(actions[0]?.payload).toEqual({ cell: 3 });
    expect(actions[1]?.payload).toEqual({ cell: 7 });
  });

  test("UNIQUE (round_id, seq): eine zweite Aktion mit derselben seq wird nicht eingefügt (Idempotenz-Fundament)", async () => {
    const db = await createTestDatabase();
    const roundId = await seedRound(db);

    const first = await insertRoundAction(db, { id: "a1", roundId, seq: 1, action: "reveal", payload: { cell: 3 } });
    const second = await insertRoundAction(db, { id: "a2", roundId, seq: 1, action: "cashOut", payload: {} });

    expect(first).not.toBeNull();
    expect(second).toBeNull();
    const actions = await findActionsForRound(db, roundId);
    expect(actions).toHaveLength(1);
    expect(actions[0]?.action).toBe("reveal");
  });

  test("findActionsForRound liefert eine leere Liste für eine Runde ohne Aktionen", async () => {
    const db = await createTestDatabase();
    const roundId = await seedRound(db);

    const actions = await findActionsForRound(db, roundId);
    expect(actions).toEqual([]);
  });
});
