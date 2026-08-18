// @vitest-environment node
import { describe, expect, test } from "vitest";
import { createTestDatabase, seedMinimalCatalog, type TestDatabase } from "@/server/db/test-harness";
import { user } from "@/server/db/auth-schema";
import { PgGameModeRepository } from "./game-mode-repository";
import { findByIdempotencyKey, findRoundForUpdate, insertOpenRound, settleRound } from "./game-round-repository";

async function seedFixture(db: TestDatabase, userId = "u1") {
  const { gameId } = await seedMinimalCatalog(db);
  await db.insert(user).values({ id: userId, name: "Testnutzer", email: `${userId}@example.com` });
  const modeRepo = new PgGameModeRepository(db);
  const mode = await modeRepo.upsert({
    id: "test-mode",
    gameId,
    key: "standard",
    label: "Standard",
    kind: "variant",
    engineKey: "dice",
    paytableKey: null,
    minBetMinor: 10,
    maxBetMinor: 1000,
    isLivePresentation: false,
    isDefault: true,
    sortOrder: 0,
    status: "active",
  });
  return { userId, modeId: mode.id };
}

describe("insertOpenRound — Idempotenz und Invariante 4 (nur eine offene Runde)", () => {
  test("legt eine neue offene Runde an", async () => {
    const db = await createTestDatabase();
    const { userId, modeId } = await seedFixture(db);

    const round = await insertOpenRound(db, {
      id: "r1",
      userId,
      gameModeId: modeId,
      stakeMinor: 100,
      seed: 42,
      maxReturnMinor: 300,
      idempotencyKey: "idem-1",
      transcript: { note: "test" },
    });

    expect(round?.status).toBe("open");
  });

  test("derselbe Idempotenzschlüssel liefert beim zweiten Versuch null (keine Doppelbuchung)", async () => {
    const db = await createTestDatabase();
    const { userId, modeId } = await seedFixture(db);
    await insertOpenRound(db, { id: "r1", userId, gameModeId: modeId, stakeMinor: 100, seed: 42, maxReturnMinor: 300, idempotencyKey: "idem-1", transcript: {} });

    const second = await insertOpenRound(db, {
      id: "r2",
      userId,
      gameModeId: modeId,
      stakeMinor: 100,
      seed: 999,
      maxReturnMinor: 300,
      idempotencyKey: "idem-1",
      transcript: {},
    });

    expect(second).toBeNull();
    const found = await findByIdempotencyKey(db, userId, "idem-1");
    expect(found?.id).toBe("r1");
  });

  test("eine zweite offene Runde für denselben Nutzer (anderer Idempotenzschlüssel) wird abgelehnt, solange die erste offen ist — Datenbankfassung von Invariante 4", async () => {
    const db = await createTestDatabase();
    const { userId, modeId } = await seedFixture(db);
    await insertOpenRound(db, { id: "r1", userId, gameModeId: modeId, stakeMinor: 100, seed: 1, maxReturnMinor: 300, idempotencyKey: "idem-1", transcript: {} });

    // `ON CONFLICT DO NOTHING` (ohne target) fängt JEDEN Unique-Verstoß ab — auch den partiellen
    // Index `game_round_user_open_unique`, nicht nur den Idempotenzschlüssel. Der Aufrufer
    // (server/rounds/round-service.ts) unterscheidet danach per Nachschlagen, welcher Fall vorliegt.
    const second = await insertOpenRound(db, {
      id: "r2",
      userId,
      gameModeId: modeId,
      stakeMinor: 100,
      seed: 2,
      maxReturnMinor: 300,
      idempotencyKey: "idem-2",
      transcript: {},
    });
    expect(second).toBeNull();

    // Die erste Runde bleibt die einzige offene — kein Teilzustand, keine zweite Zeile.
    const stillOnlyOne = await findByIdempotencyKey(db, userId, "idem-1");
    expect(stillOnlyOne?.status).toBe("open");
    const attemptedSecond = await findByIdempotencyKey(db, userId, "idem-2");
    expect(attemptedSecond).toBeNull();
  });

  test("nach dem Abschluss der ersten Runde ist eine neue offene Runde wieder möglich", async () => {
    const db = await createTestDatabase();
    const { userId, modeId } = await seedFixture(db);
    await insertOpenRound(db, { id: "r1", userId, gameModeId: modeId, stakeMinor: 100, seed: 1, maxReturnMinor: 300, idempotencyKey: "idem-1", transcript: {} });
    await settleRound(db, "r1", { outcomeKey: "none", returnMinor: 0, transcript: {} });

    const second = await insertOpenRound(db, {
      id: "r2",
      userId,
      gameModeId: modeId,
      stakeMinor: 100,
      seed: 2,
      maxReturnMinor: 300,
      idempotencyKey: "idem-2",
      transcript: {},
    });

    expect(second?.id).toBe("r2");
  });
});

describe("settleRound", () => {
  test("schließt eine offene Runde ab und setzt Ergebnisfelder", async () => {
    const db = await createTestDatabase();
    const { userId, modeId } = await seedFixture(db);
    await insertOpenRound(db, { id: "r1", userId, gameModeId: modeId, stakeMinor: 100, seed: 1, maxReturnMinor: 300, idempotencyKey: "idem-1", transcript: {} });

    const settled = await settleRound(db, "r1", { outcomeKey: "win", returnMinor: 250, transcript: { win: true } });

    expect(settled.status).toBe("settled");
    expect(settled.returnMinor).toBe(250);
    expect(settled.outcomeKey).toBe("win");
    expect(settled.settledAt).not.toBeNull();
  });

  test("ein zweiter Abschluss derselben Runde wirft (kein doppeltes Settle)", async () => {
    const db = await createTestDatabase();
    const { userId, modeId } = await seedFixture(db);
    await insertOpenRound(db, { id: "r1", userId, gameModeId: modeId, stakeMinor: 100, seed: 1, maxReturnMinor: 300, idempotencyKey: "idem-1", transcript: {} });
    await settleRound(db, "r1", { outcomeKey: "win", returnMinor: 250, transcript: {} });

    await expect(settleRound(db, "r1", { outcomeKey: "win", returnMinor: 250, transcript: {} })).rejects.toThrow();
  });
});

describe("findRoundForUpdate", () => {
  test("liefert die Runde (innerhalb einer Transaktion, mit Zeilensperre)", async () => {
    const db = await createTestDatabase();
    const { userId, modeId } = await seedFixture(db);
    await insertOpenRound(db, { id: "r1", userId, gameModeId: modeId, stakeMinor: 100, seed: 1, maxReturnMinor: 300, idempotencyKey: "idem-1", transcript: {} });

    const found = await db.transaction((tx) => findRoundForUpdate(tx, "r1"));

    expect(found?.id).toBe("r1");
    expect(found?.status).toBe("open");
  });

  test("liefert null für eine unbekannte Runden-ID", async () => {
    const db = await createTestDatabase();
    await seedFixture(db);

    const found = await db.transaction((tx) => findRoundForUpdate(tx, "does-not-exist"));

    expect(found).toBeNull();
  });
});
