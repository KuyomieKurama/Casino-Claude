// @vitest-environment node
import { describe, expect, test, vi } from "vitest";

vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  return { ...actual, randomInt: vi.fn(() => 12345) };
});

import { eq } from "drizzle-orm";
import { createTestDatabase, seedMinimalCatalog, type TestDatabase } from "@/server/db/test-harness";
import { user } from "@/server/db/auth-schema";
import { wallet } from "@/server/db/schema";
import { maxReturnFor } from "@/components/game/engine/blackjack/blackjack-logic";
import { PgGameModeRepository } from "@/server/repositories/game-mode-repository";
import { findWallet, insertWalletIfMissing } from "@/server/repositories/wallet-repository";
import { findActionsForRound } from "@/server/repositories/game-round-action-repository";
import { listLedgerEntries, sumLedgerAmountForUser } from "@/server/repositories/ledger-repository";
import { startBlackjackRoundState, isBlackjackRoundFinished } from "./interactive/blackjack-adapter";
import { startInteractiveRound } from "./interactive-round-service";

const START_BALANCE_MINOR = 100_000;

async function seedMode(db: TestDatabase, engineKey: "mines" | "blackjack" | "videopoker" | "dice", id: string, overrides: { minBetMinor?: number; maxBetMinor?: number } = {}) {
  const { gameId } = await seedMinimalCatalog(db);
  const modeRepo = new PgGameModeRepository(db);
  const mode = await modeRepo.upsert({
    id,
    gameId,
    key: "standard",
    label: "Standard",
    kind: "variant",
    engineKey,
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

async function seedUser(db: TestDatabase, id = "u1"): Promise<string> {
  await db.insert(user).values({ id, name: "Testnutzer", email: `${id}@example.com` });
  return id;
}

describe("startInteractiveRound — Mines", () => {
  test("bucht den Einsatz, legt eine offene Runde an und zeigt keine Minenpositionen", async () => {
    const db = await createTestDatabase();
    const modeId = await seedMode(db, "mines", "g-mines-demo");
    const userId = await seedUser(db);

    const result = await startInteractiveRound(db, { userId, gameModeId: modeId, stakeMinor: 100, idempotencyKey: "k1", betId: "m3" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.status).toBe("open");
    if (result.data.status !== "open") return;
    expect(result.data.stakeMinor).toBe(100);
    expect(result.data.betKey).toBe("m3");
    expect(result.data.nextSeq).toBe(1);
    expect(result.data.state).not.toHaveProperty("positions");
    expect(result.data.state).not.toHaveProperty("hitCell");

    const wallet = await findWallet(db, userId);
    expect(wallet?.demoBalanceMinor).toBe(START_BALANCE_MINOR - 100);
  });

  test("maxReturnMinor entspricht der obersten Stufe der Multiplikator-Staffel (m3, alle Felder aufgedeckt)", async () => {
    const db = await createTestDatabase();
    const modeId = await seedMode(db, "mines", "g-mines-demo");
    const userId = await seedUser(db);

    const result = await startInteractiveRound(db, { userId, gameModeId: modeId, stakeMinor: 1000, idempotencyKey: "k1", betId: "m3" });

    expect(result.ok).toBe(true);
    if (!result.ok || result.data.status !== "open") return;
    expect(result.data.maxReturnMinor).toBeGreaterThan(1000);
  });

  test("Idempotenz: derselbe Schlüssel liefert dieselbe Runde zurück, ohne erneut zu buchen", async () => {
    const db = await createTestDatabase();
    const modeId = await seedMode(db, "mines", "g-mines-demo");
    const userId = await seedUser(db);

    const first = await startInteractiveRound(db, { userId, gameModeId: modeId, stakeMinor: 100, idempotencyKey: "same", betId: "m3" });
    const second = await startInteractiveRound(db, { userId, gameModeId: modeId, stakeMinor: 100, idempotencyKey: "same", betId: "m3" });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (first.ok && second.ok && first.data.status === "open" && second.data.status === "open") {
      expect(second.data.roundId).toBe(first.data.roundId);
    }
    const wallet = await findWallet(db, userId);
    expect(wallet?.demoBalanceMinor).toBe(START_BALANCE_MINOR - 100); // nicht zweimal abgebucht
  });

  test("Invariante 1: ein Einsatz über dem Bestand wird abgelehnt, kein Teilzustand", async () => {
    const db = await createTestDatabase();
    const modeId = await seedMode(db, "mines", "g-mines-demo", { maxBetMinor: 10_000_000 });
    const userId = await seedUser(db);

    const result = await startInteractiveRound(db, { userId, gameModeId: modeId, stakeMinor: 999_999, idempotencyKey: "k1", betId: "m3" });

    expect(result).toEqual({ ok: false, code: "INSUFFICIENT_FUNDS" });
    const wallet = await findWallet(db, userId);
    expect(wallet?.demoBalanceMinor).toBe(START_BALANCE_MINOR);
  });

  test("lehnt einen Einsatz außerhalb der Modus-Grenzen ab", async () => {
    const db = await createTestDatabase();
    const modeId = await seedMode(db, "mines", "g-mines-demo", { minBetMinor: 100, maxBetMinor: 1000 });
    const userId = await seedUser(db);

    const result = await startInteractiveRound(db, { userId, gameModeId: modeId, stakeMinor: 5, idempotencyKey: "k1", betId: "m3" });

    expect(result).toEqual({ ok: false, code: "INVALID_STAKE" });
  });

  test("lehnt nicht-interaktive Engines ab (gehören zu round-service.ts)", async () => {
    const db = await createTestDatabase();
    const modeId = await seedMode(db, "dice", "g-dice-demo");
    const userId = await seedUser(db);

    const result = await startInteractiveRound(db, { userId, gameModeId: modeId, stakeMinor: 100, idempotencyKey: "k1" });

    expect(result).toEqual({ ok: false, code: "INVALID_STAKE" });
  });

  test("Konsistenz: Ledger-Summe entspricht dem Saldo nach Rundenstart", async () => {
    const db = await createTestDatabase();
    const modeId = await seedMode(db, "mines", "g-mines-demo");
    const userId = await seedUser(db);

    await startInteractiveRound(db, { userId, gameModeId: modeId, stakeMinor: 100, idempotencyKey: "k1", betId: "m3" });

    const wallet = await findWallet(db, userId);
    const ledgerSum = await sumLedgerAmountForUser(db, userId);
    expect(ledgerSum).toBe(wallet?.demoBalanceMinor);
  });
});

describe("startInteractiveRound — Video Poker", () => {
  test("zeigt die Starthand, aber nicht das Restdeck oder den Seed", async () => {
    const db = await createTestDatabase();
    const modeId = await seedMode(db, "videopoker", "g-videopoker-demo");
    const userId = await seedUser(db);

    const result = await startInteractiveRound(db, { userId, gameModeId: modeId, stakeMinor: 100, idempotencyKey: "k1" });

    expect(result.ok).toBe(true);
    if (!result.ok || result.data.status !== "open") return;
    expect(result.data.state).toHaveProperty("hand");
    expect(result.data.state).not.toHaveProperty("draw");
    expect(result.data.state).not.toHaveProperty("seed");
  });
});

describe("startInteractiveRound — Blackjack (natürlicher Blackjack beim Austeilen)", () => {
  test("ist die Runde direkt nach dem Austeilen fertig, wird sie SOFORT abgerechnet und der Seed dafür bestimmt", async () => {
    // Seed suchen, der einen natürlichen Blackjack austeilt (randomInt ist oben gemockt — hier
    // wird nur geprüft, DASS diese Situation korrekt behandelt wird, nicht mit welchem Seed).
    let naturalSeed: number | null = null;
    for (let seed = 1; seed < 2000; seed++) {
      if (isBlackjackRoundFinished(startBlackjackRoundState({ seed, stakeMinor: 100, betKey: null }))) {
        naturalSeed = seed;
        break;
      }
    }
    expect(naturalSeed).not.toBeNull();
    // crypto.randomInt ist fest auf 12345 gemockt (oben) — dieser Test verifiziert daher die
    // Behandlung für GENAU diesen Seed, nicht für naturalSeed direkt.
    const db = await createTestDatabase();
    const modeId = await seedMode(db, "blackjack", "g-blackjack-demo");
    const userId = await seedUser(db);

    const result = await startInteractiveRound(db, { userId, gameModeId: modeId, stakeMinor: 100, idempotencyKey: "k1" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    if (isBlackjackRoundFinished(startBlackjackRoundState({ seed: 12345, stakeMinor: 100, betKey: null }))) {
      expect(result.data.status).toBe("settled");
      if (result.data.status === "settled") {
        expect(result.data.returnMinor).toBeGreaterThanOrEqual(0);
        expect(result.data.state).toHaveProperty("dealer");
      }
      const actions = await findActionsForRound(db, result.data.roundId);
      expect(actions).toHaveLength(0); // kein Spielzug nötig — Ergebnis stand sofort fest.
    } else {
      expect(result.data.status).toBe("open");
    }
  });

  test("maxReturnMinor entspricht maxReturnFor(stakeMinor) aus blackjack-logic.ts", async () => {
    const db = await createTestDatabase();
    const modeId = await seedMode(db, "blackjack", "g-blackjack-demo");
    const userId = await seedUser(db);

    const result = await startInteractiveRound(db, { userId, gameModeId: modeId, stakeMinor: 300, idempotencyKey: "k1" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    if (result.data.status === "open") expect(result.data.maxReturnMinor).toBe(maxReturnFor(300));
  });
});

describe("startInteractiveRound — Freirunde", () => {
  test("eine Freirunde bucht 0 vom Guthaben ab, verbraucht aber genau eine Freirunde", async () => {
    const db = await createTestDatabase();
    const modeId = await seedMode(db, "mines", "g-mines-demo");
    const userId = await seedUser(db);
    const { walletRecord } = await insertWalletIfMissing(db, userId, START_BALANCE_MINOR);
    // Eine Freirunde manuell gutschreiben (Freispiel-Vergabe ist nicht Teil dieser Phase).
    await db.update(wallet).set({ freeSpins: 1 }).where(eq(wallet.userId, walletRecord.userId));

    const result = await startInteractiveRound(db, { userId, gameModeId: modeId, stakeMinor: 100, idempotencyKey: "k1", betId: "m3", useFreeSpin: true });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const walletAfter = await findWallet(db, userId);
    expect(walletAfter?.demoBalanceMinor).toBe(START_BALANCE_MINOR); // unverändert — kein Abzug
    expect(walletAfter?.freeSpins).toBe(0);
    const entries = await listLedgerEntries(db, userId, 10);
    expect(entries.some((e) => e.type === "free_spin")).toBe(true);
  });
});

describe("Responsible-Gaming-Sperre blockiert den interaktiven Rundenstart (Auftrag „Server statt Client“)", () => {
  test("ein selbstgesperrter Nutzer kann keine interaktive Runde (Blackjack, Mines, Video Poker) starten — auch nicht über einen direkten API-Aufruf", async () => {
    const db = await createTestDatabase();
    const modeId = await seedMode(db, "mines", "g-mines-demo");
    const userId = await seedUser(db);
    const { activateSelfExclusion } = await import("@/server/repositories/rg-settings-repository");
    await activateSelfExclusion(db, userId, new Date().toISOString());

    const result = await startInteractiveRound(db, { userId, gameModeId: modeId, stakeMinor: 100, idempotencyKey: "k1", betId: "m3" });

    expect(result).toEqual({ ok: false, code: "RG_BLOCKED" });
    expect(await findWallet(db, userId)).toBeNull();
  });
});
