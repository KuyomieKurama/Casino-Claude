// @vitest-environment node
import { describe, expect, test, vi } from "vitest";

// Fester Seed für deterministische, exakt nachrechenbare Ergebnisse (siehe Tamper- und
// Wiedergabetest unten). Der Server ruft `crypto.randomInt` NUR in round-service.ts auf — der
// Mock betrifft ausschließlich diese Testdatei.
vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  return { ...actual, randomInt: vi.fn(() => 12345) };
});

import { eq } from "drizzle-orm";
import { createTestDatabase, seedMinimalCatalog, type TestDatabase } from "@/server/db/test-harness";
import { user } from "@/server/db/auth-schema";
import { wallet as walletTable } from "@/server/db/schema";
import { PgGameModeRepository } from "@/server/repositories/game-mode-repository";
import { findWallet, debitForStake } from "@/server/repositories/wallet-repository";
import { sumLedgerAmountForUser, listLedgerEntries } from "@/server/repositories/ledger-repository";
import { findByIdempotencyKey } from "@/server/repositories/game-round-repository";
import { resolveDice } from "@/components/game/engine/arcade/dice-logic";
import { START_BALANCE_MINOR } from "@/lib/constants";
import { resolveNonInteractiveOutcome } from "./engine-resolvers";
import { startNonInteractiveRound, type StartRoundInput } from "./round-service";

vi.mock("server-only", () => ({}));

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

  /**
   * Serverseitiges Gegenstück zu einer entfernten Aussage aus dem früheren, lokalen START_ROUND-Pfad
   * (state/wallet-reducer.ts, vor Phase 3b): Bonusguthaben wird zuerst eingesetzt, der Rest kommt
   * aus dem Demo-Guthaben. Die reine Regel (lib/wallet-policy.ts::splitStakeAcrossBalances) ist
   * bereits vollständig in lib/wallet-policy.test.ts geprüft — hier wird bewiesen, dass der Server
   * sie tatsächlich beim Einsatz-Abbuchen verdrahtet, nicht nur, dass die Funktion selbst korrekt ist.
   */
  test("Bonusguthaben wird vor dem Demo-Guthaben eingesetzt", async () => {
    const db = await createTestDatabase();
    const modeId = await seedMode(db);
    const userId = await seedUser(db, "u1");
    // Erstzugriff legt das Wallet mit dem Startguthaben an.
    await startNonInteractiveRound(db, { userId, gameModeId: modeId, stakeMinor: 10, idempotencyKey: "warmup" });
    // Bonusgutschrift manuell nachziehen (Vergabe ist nicht Teil dieser Phase, siehe Auftrag).
    await db.update(walletTable).set({ bonusBalanceMinor: 300 }).where(eq(walletTable.userId, userId));
    const before = await findWallet(db, userId);
    expect(before?.bonusBalanceMinor).toBe(300);

    const result = await startNonInteractiveRound(db, { userId, gameModeId: modeId, stakeMinor: 500, idempotencyKey: "k-split", betId: "under-50" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const after = await findWallet(db, userId);
    // 500 Einsatz: erst die 300 Bonus (auf 0), der Rest (200) kommt aus dem Demo-Guthaben.
    expect(after?.bonusBalanceMinor).toBe(0);
    expect(after?.demoBalanceMinor).toBe((before?.demoBalanceMinor ?? 0) - 200 + result.data.returnMinor);
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

  /**
   * Mehrfaches An-/Abmelden darf das Startguthaben nicht wiederholt gutschreiben (Auftrag §7):
   * die Gutschrift ist an die WALLET-ANLAGE gebunden (insertWalletIfMissing, „created: true"),
   * nicht an das Zustandekommen einer Sitzung. Dieser Test simuliert mehrere „Logins" (mehrere,
   * voneinander unabhängige Rundenstart-Aufrufe für denselben Nutzer, so wie sie nach jeweils
   * neuer Anmeldung entstünden) und beweist, dass nur der ERSTE eine demo_credit-Buchung erzeugt.
   */
  test("mehrfaches An- und Abmelden erhöht das Guthaben nicht — die Startguthaben-Buchung bleibt einmalig", async () => {
    const db = await createTestDatabase();
    const modeId = await seedMode(db);
    const userId = await seedUser(db, "u1");

    // Drei „Sitzungen" nacheinander: jede startet (mindestens) eine Runde, so wie ein Nutzer, der
    // sich anmeldet, spielt, sich abmeldet, sich erneut anmeldet und wieder spielt.
    const first = await startNonInteractiveRound(db, { userId, gameModeId: modeId, stakeMinor: 100, idempotencyKey: "session-1-round-1" });
    expect(first.ok).toBe(true);
    const second = await startNonInteractiveRound(db, { userId, gameModeId: modeId, stakeMinor: 100, idempotencyKey: "session-2-round-1" });
    expect(second.ok).toBe(true);
    const third = await startNonInteractiveRound(db, { userId, gameModeId: modeId, stakeMinor: 100, idempotencyKey: "session-3-round-1" });
    expect(third.ok).toBe(true);

    const entries = await listLedgerEntries(db, userId, 20);
    const creditEntries = entries.filter((e) => e.type === "demo_credit");
    // Genau EINE Startguthaben-Buchung über die gesamte „Kontolebensdauer" — unabhängig davon,
    // wie oft sich der Nutzer zwischenzeitlich an- und abgemeldet hat.
    expect(creditEntries).toHaveLength(1);
    expect(creditEntries[0]?.amountMinor).toBe(START_BALANCE_MINOR);

    // Zusätzlich: das Wallet selbst legt bei jedem weiteren Aufruf nichts erneut an (dieselbe
    // Prüfung wie server/repositories/wallet-repository.test.ts, hier über den vollen
    // Rundenstart-Pfad statt isoliert auf Repository-Ebene).
    const { insertWalletIfMissing } = await import("@/server/repositories/wallet-repository");
    const { created } = await insertWalletIfMissing(db, userId, START_BALANCE_MINOR);
    expect(created).toBe(false);
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

describe("Responsible-Gaming-Sperre blockiert den nicht-interaktiven Rundenstart (Auftrag „Server statt Client“)", () => {
  test("ein selbstgesperrter Nutzer kann über den Service — und damit über jeden Aufrufer, inklusive einem direkten API-Aufruf unter Umgehung der Oberfläche — keine Runde starten", async () => {
    const db = await createTestDatabase();
    const modeId = await seedMode(db);
    const userId = await seedUser(db, "u1");
    const { activateSelfExclusion } = await import("@/server/repositories/rg-settings-repository");
    await activateSelfExclusion(db, userId, new Date().toISOString());

    const result = await startNonInteractiveRound(db, { userId, gameModeId: modeId, stakeMinor: 100, idempotencyKey: "k1" });

    expect(result).toEqual({ ok: false, code: "RG_BLOCKED" });
    // Beweis, dass wirklich nichts gebucht wurde: kein Wallet, keine Ledger-Zeile, keine Runde.
    expect(await findWallet(db, userId)).toBeNull();
    expect(await listLedgerEntries(db, userId, 10)).toEqual([]);
  });

  test("eine bereits abgeschlossene, wiederholte Anfrage (Idempotenzschlüssel) wird trotz nachträglicher Selbstsperre weiterhin aus dem Protokoll beantwortet, statt neu geprüft zu werden", async () => {
    const db = await createTestDatabase();
    const modeId = await seedMode(db);
    const userId = await seedUser(db, "u1");
    const first = await startNonInteractiveRound(db, { userId, gameModeId: modeId, stakeMinor: 100, idempotencyKey: "k1" });
    expect(first.ok).toBe(true);
    const { activateSelfExclusion } = await import("@/server/repositories/rg-settings-repository");
    await activateSelfExclusion(db, userId, new Date().toISOString());

    const replay = await startNonInteractiveRound(db, { userId, gameModeId: modeId, stakeMinor: 100, idempotencyKey: "k1" });

    expect(replay.ok).toBe(true);
    if (replay.ok && first.ok) expect(replay.data.roundId).toBe(first.data.roundId);
  });

  test("nach Ablauf einer Pause ist ein Rundenstart wieder möglich", async () => {
    const db = await createTestDatabase();
    const modeId = await seedMode(db);
    const userId = await seedUser(db, "u1");
    const { setPause } = await import("@/server/repositories/rg-settings-repository");
    const now = new Date();
    await setPause(db, userId, new Date(now.getTime() - 60_000).toISOString()); // bereits abgelaufen

    const result = await startNonInteractiveRound(db, { userId, gameModeId: modeId, stakeMinor: 100, idempotencyKey: "k1" });

    expect(result.ok).toBe(true);
  });

  test("nach Erreichen des Zeitlimits (aus play_session berechnet) wird der Rundenstart abgelehnt", async () => {
    const db = await createTestDatabase();
    const modeId = await seedMode(db);
    const userId = await seedUser(db, "u1");
    const { setSessionLimitMinutes } = await import("@/server/repositories/rg-settings-repository");
    const { touchPlaySession } = await import("@/server/repositories/play-session-repository");
    // Rundenstart prüft intern gegen die tatsächliche Serverzeit (nowIso()), nicht gegen einen vom
    // Test frei wählbaren Zeitpunkt — die Sitzung beginnt deshalb real 6 Minuten in der
    // Vergangenheit: innerhalb der 30-Minuten-Lücken-Schwelle (SESSION_GAP_MS), damit derselbe
    // Rundenstart die Sitzung fortschreibt statt eine neue zu beginnen, aber über dem gleich
    // gesetzten 5-Minuten-Limit.
    const sessionStart = new Date(Date.now() - 6 * 60_000).toISOString();
    await touchPlaySession(db, userId, sessionStart);
    await setSessionLimitMinutes(db, userId, 5);

    const result = await startNonInteractiveRound(db, { userId, gameModeId: modeId, stakeMinor: 100, idempotencyKey: "k1" });

    expect(result).toEqual({ ok: false, code: "RG_BLOCKED" });
  });
});
