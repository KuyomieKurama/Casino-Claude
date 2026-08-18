// @vitest-environment node
import { describe, expect, test, vi } from "vitest";

// Fester Seed für deterministische, exakt nachrechenbare Ergebnisse (siehe Tamper- und
// Wiedergabetest unten). Der Server ruft `crypto.randomInt` NUR in round-service.ts auf — der
// Mock betrifft ausschließlich diese Testdatei.
vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  return { ...actual, randomInt: vi.fn(() => 12345) };
});

import { createTestDatabase, seedMinimalCatalog, type TestDatabase } from "@/server/db/test-harness";
import { user } from "@/server/db/auth-schema";
import { createGuestAccount, upgradeGuestToEmailAccount } from "@/server/auth/guests";
import { PgGameModeRepository } from "@/server/repositories/game-mode-repository";
import { findWallet, debitForStake } from "@/server/repositories/wallet-repository";
import { sumLedgerAmountForUser, listLedgerEntries } from "@/server/repositories/ledger-repository";
import { findByIdempotencyKey } from "@/server/repositories/game-round-repository";
import { resolveDice } from "@/components/game/engine/arcade/dice-logic";
import { resolveNonInteractiveOutcome } from "./engine-resolvers";
import { startNonInteractiveRound, type StartRoundInput } from "./round-service";

vi.mock("server-only", () => ({}));

const START_BALANCE_MINOR = 100_000;

async function seedMode(db: TestDatabase, overrides: { id?: string; engineKey?: "dice" | "roulette" | "slot"; minBetMinor?: number; maxBetMinor?: number } = {}) {
  const { gameId } = await seedMinimalCatalog(db);
  const modeRepo = new PgGameModeRepository(db);
  const mode = await modeRepo.upsert({
    id: overrides.id ?? "g-dice-demo",
    gameId,
    key: "standard",
    label: "Standard",
    kind: "variant",
    engineKey: overrides.engineKey ?? "dice",
    paytableKey: null,
    minBetMinor: overrides.minBetMinor ?? 10,
    maxBetMinor: overrides.maxBetMinor ?? 100_000,
    isLivePresentation: false,
    isDefault: true,
    sortOrder: 0,
    status: "active",
  });
  return mode.id;
}

async function seedUser(db: TestDatabase, id: string): Promise<string> {
  await db.insert(user).values({ id, name: "Testnutzer", email: `${id}@example.com` });
  return id;
}

describe("startNonInteractiveRound", () => {
  test("legt bei erstem Zugriff das Startguthaben als Ledger-Buchung an und bucht dann Einsatz und Rückgabe", async () => {
    const db = await createTestDatabase();
    const modeId = await seedMode(db);
    const userId = await seedUser(db, "u1");

    const result = await startNonInteractiveRound(db, { userId, gameModeId: modeId, stakeMinor: 100, idempotencyKey: "k1", betId: "under-50" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.stakeMinor).toBe(100);
    expect(result.data.netMinor).toBe(result.data.returnMinor - 100);

    const entries = await listLedgerEntries(db, userId, 10);
    // demo_credit (Start) + demo_bet + demo_win = drei Buchungen für die erste jemals gespielte Runde.
    expect(entries.map((e) => e.type)).toEqual(["demo_win", "demo_bet", "demo_credit"]);
    expect(entries[2]?.amountMinor).toBe(START_BALANCE_MINOR);
  });

  test("Invariante 1: lehnt einen Einsatz über dem Bestand ab, statt ihn zu kappen — kein Teilzustand", async () => {
    const db = await createTestDatabase();
    const modeId = await seedMode(db, { minBetMinor: 10, maxBetMinor: 100_000_00 });
    const userId = await seedUser(db, "u1");
    // Guthaben bis auf 50 herunterbuchen.
    await startNonInteractiveRound(db, { userId, gameModeId: modeId, stakeMinor: 10, idempotencyKey: "warmup" });
    const before = await findWallet(db, userId);
    expect(before).not.toBeNull();
    await debitForStake(db, userId, { fromBonusMinor: 0, fromDemoMinor: (before?.demoBalanceMinor ?? 0) - 50 });

    const result = await startNonInteractiveRound(db, { userId, gameModeId: modeId, stakeMinor: 51, idempotencyKey: "k-over" });

    expect(result).toEqual({ ok: false, code: "INSUFFICIENT_FUNDS" });
    const after = await findWallet(db, userId);
    expect(after?.demoBalanceMinor).toBe(50); // unverändert — kein stiller Teilabzug
    const attempted = await findByIdempotencyKey(db, userId, "k-over");
    expect(attempted).toBeNull(); // keine Runde wurde angelegt
  });

  test("lehnt einen Einsatz außerhalb der Modus-Grenzen ab (INVALID_STAKE)", async () => {
    const db = await createTestDatabase();
    const modeId = await seedMode(db, { minBetMinor: 100, maxBetMinor: 1_000 });
    const userId = await seedUser(db, "u1");

    const result = await startNonInteractiveRound(db, { userId, gameModeId: modeId, stakeMinor: 5, idempotencyKey: "k1" });

    expect(result).toEqual({ ok: false, code: "INVALID_STAKE" });
  });

  test("Idempotenz: derselbe Schlüssel zweimal → genau eine Buchung", async () => {
    const db = await createTestDatabase();
    const modeId = await seedMode(db);
    const userId = await seedUser(db, "u1");

    const first = await startNonInteractiveRound(db, { userId, gameModeId: modeId, stakeMinor: 100, idempotencyKey: "same-key" });
    const second = await startNonInteractiveRound(db, { userId, gameModeId: modeId, stakeMinor: 100, idempotencyKey: "same-key" });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(second.data.roundId).toBe(first.data.roundId);
      expect(second.data.returnMinor).toBe(first.data.returnMinor);
    }
    const entries = await listLedgerEntries(db, userId, 20);
    // Startguthaben + genau ein Einsatz + genau eine Rückgabe — nicht sechs Buchungen.
    expect(entries).toHaveLength(3);
  });

  test("Konsistenz: Summe der Ledger-Beträge entspricht dem materialisierten Saldo nach mehreren Runden", async () => {
    const db = await createTestDatabase();
    const modeId = await seedMode(db);
    const userId = await seedUser(db, "u1");

    for (let i = 0; i < 5; i++) {
      const r = await startNonInteractiveRound(db, { userId, gameModeId: modeId, stakeMinor: 100, idempotencyKey: `k${i}` });
      expect(r.ok).toBe(true);
    }

    const wallet = await findWallet(db, userId);
    const ledgerSum = await sumLedgerAmountForUser(db, userId);
    expect(ledgerSum).toBe((wallet?.demoBalanceMinor ?? 0) + (wallet?.bonusBalanceMinor ?? 0));
  });

  test("ein manipulierter Client, der returnMinor mitschickt, kann das Ergebnis nicht beeinflussen", async () => {
    const db = await createTestDatabase();
    const modeId = await seedMode(db);
    const userId = await seedUser(db, "u1");

    const tamperedInput = { userId, gameModeId: modeId, stakeMinor: 100, idempotencyKey: "k1", betId: "under-50", returnMinor: 999_999_999 } as unknown as StartRoundInput;
    const result = await startNonInteractiveRound(db, tamperedInput);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Erwartung ausschließlich aus der reinen Engine-Funktion mit dem (gemockten) Server-Seed
    // berechnet — der eingeschleuste `returnMinor` im Input hat keinerlei Einfluss.
    const expected = resolveDice(100, 12345, "under-50");
    expect(result.data.returnMinor).toBe(expected.returnMinor);
    expect(result.data.returnMinor).not.toBe(999_999_999);
  });

  test("Wiedergabetest: dieselbe Runde erneut aus (modeId, stake, seed, betKey) aufgelöst ergibt exakt return_minor", async () => {
    const db = await createTestDatabase();
    const modeId = await seedMode(db);
    const userId = await seedUser(db, "u1");

    const result = await startNonInteractiveRound(db, { userId, gameModeId: modeId, stakeMinor: 250, idempotencyKey: "k1", betId: "under-50" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const replay = resolveNonInteractiveOutcome("dice", { gameModeId: modeId, stakeMinor: 250, seed: result.data.seed, betId: "under-50" });
    expect(replay.ok).toBe(true);
    if (replay.ok) expect(replay.outcome.returnMinor).toBe(result.data.returnMinor);
  });

  test("Gastkonto: Runde ohne Anmeldung möglich, nach Anmeldung bleiben Guthaben und Historie erhalten", async () => {
    const db = await createTestDatabase();
    const modeId = await seedMode(db);
    const guest = await createGuestAccount(db);

    const asGuest = await startNonInteractiveRound(db, { userId: guest.userId, gameModeId: modeId, stakeMinor: 100, idempotencyKey: "k1" });
    expect(asGuest.ok).toBe(true);

    const { userId: upgradedId } = await upgradeGuestToEmailAccount(db, {
      guestUserId: guest.userId,
      email: "spieler@example.com",
      password: "ein-sicheres-passwort",
      name: "Spieler",
    });
    expect(upgradedId).toBe(guest.userId);

    const walletAfterUpgrade = await findWallet(db, upgradedId);
    const ledgerAfterUpgrade = await listLedgerEntries(db, upgradedId, 10);
    expect(walletAfterUpgrade).not.toBeNull();
    expect(ledgerAfterUpgrade.length).toBeGreaterThan(0);

    const asMember = await startNonInteractiveRound(db, { userId: upgradedId, gameModeId: modeId, stakeMinor: 100, idempotencyKey: "k2" });
    expect(asMember.ok).toBe(true);
  });

  test("lehnt Modi ab, die serverseitig nicht aufgelöst werden (interaktive Engines wie Blackjack)", async () => {
    const db = await createTestDatabase();
    const { gameId } = await seedMinimalCatalog(db);
    const modeRepo = new PgGameModeRepository(db);
    const blackjackMode = await modeRepo.upsert({
      id: "g-classic-blackjack",
      gameId,
      key: "standard",
      label: "Standard",
      kind: "variant",
      engineKey: "blackjack",
      paytableKey: null,
      minBetMinor: 10,
      maxBetMinor: 1_000,
      isLivePresentation: false,
      isDefault: true,
      sortOrder: 0,
      status: "active",
    });
    const userId = await seedUser(db, "u1");

    const result = await startNonInteractiveRound(db, { userId, gameModeId: blackjackMode.id, stakeMinor: 100, idempotencyKey: "k1" });

    expect(result).toEqual({ ok: false, code: "INVALID_STAKE" });
  });
});
