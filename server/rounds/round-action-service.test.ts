// @vitest-environment node
import { describe, expect, test } from "vitest";
import { createTestDatabase, seedMinimalCatalog, type TestDatabase } from "@/server/db/test-harness";
import { user } from "@/server/db/auth-schema";
import { minePositions } from "@/components/game/engine/arcade/mines-logic";
import { PgGameModeRepository } from "@/server/repositories/game-mode-repository";
import { insertWalletIfMissing, debitForStake, findWallet } from "@/server/repositories/wallet-repository";
import { findByIdempotencyKey, insertOpenRound } from "@/server/repositories/game-round-repository";
import { findActionsForRound } from "@/server/repositories/game-round-action-repository";
import { insertLedgerEntry, listLedgerEntries, sumLedgerAmountForUser } from "@/server/repositories/ledger-repository";
import { startMinesRoundState, applyMinesAction, settleMinesRound } from "./interactive/mines-adapter";
import { applyRoundAction } from "./round-action-service";

const USER_ID = "u1";
const START_BALANCE_MINOR = 100_000;

async function seedMode(db: TestDatabase, engineKey: "mines" | "blackjack" | "videopoker", id: string) {
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
    minBetMinor: 10,
    maxBetMinor: 100_000,
    isLivePresentation: false,
    isDefault: true,
    sortOrder: 0,
    status: "active",
  });
  return mode.id;
}

async function seedUserAndWallet(db: TestDatabase): Promise<void> {
  await db.insert(user).values({ id: USER_ID, name: "Testnutzer", email: "u1@example.com" });
  const { walletRecord } = await insertWalletIfMissing(db, USER_ID, START_BALANCE_MINOR);
  // Startguthaben als Ledger-Buchung (wie round-service.ts::startNonInteractiveRound), sonst wäre
  // die Konsistenzprüfung "Ledger-Summe = Saldo" in diesen isolierten Tests bedeutungslos.
  await insertLedgerEntry(db, {
    userId: USER_ID,
    seq: 1,
    type: "credit",
    amountMinor: START_BALANCE_MINOR,
    balanceAfterMinor: walletRecord.balanceMinor,
  });
}

/**
 * Bildet den Grundeinsatz-Schritt nach, den server/rounds/interactive-round-service.ts vor dem
 * Anlegen der Runde ausführt (bedingtes UPDATE + Ledger-Buchung) — INKLUSIVE Ledger-Eintrag,
 * damit die Konsistenzprüfung (Ledger-Summe = Saldo) in diesen isolierten Tests aussagekräftig bleibt.
 */
async function debitStakeWithLedger(db: TestDatabase, userId: string, stakeMinor: number): Promise<void> {
  const debit = await debitForStake(db, userId, { fromBonusMinor: 0, fromBalanceMinor: stakeMinor });
  if (!debit.ok) throw new Error("Testaufbau fehlgeschlagen: Grundeinsatz konnte nicht abgebucht werden.");
  await insertLedgerEntry(db, {
    userId,
    seq: debit.walletRecord.nextSeq - 1,
    type: "bet",
    amountMinor: -stakeMinor,
    balanceAfterMinor: debit.walletRecord.balanceMinor + debit.walletRecord.bonusBalanceMinor,
    fromBalanceMinor: stakeMinor,
    fromBonusMinor: 0,
  });
}

/**
 * Bildet nach, was server/rounds/interactive-round-service.ts vor dem Anlegen der Runde tut: den
 * Grundeinsatz abbuchen. round-action-service.ts selbst bucht ausschließlich Zusatzeinsätze und
 * die Rückgabe — der Grundeinsatz muss für realistische Saldo-Erwartungen hier bereits fehlen.
 */
async function seedMinesRound(db: TestDatabase, opts: { id?: string; seed?: number; stakeMinor?: number; betKey?: string; userId?: string } = {}) {
  const modeId = await seedMode(db, "mines", opts.id ? `${opts.id}-mode` : "g-mines-demo");
  await seedUserAndWallet(db);
  const userId = opts.userId ?? USER_ID;
  const stakeMinor = opts.stakeMinor ?? 100;
  await debitStakeWithLedger(db, userId, stakeMinor);
  const round = await insertOpenRound(db, {
    id: opts.id ?? "r1",
    userId,
    gameModeId: modeId,
    betKey: opts.betKey ?? "m3",
    stakeMinor,
    seed: opts.seed ?? 777,
    maxReturnMinor: 1_000_000,
    idempotencyKey: `idem-${opts.id ?? "r1"}`,
    transcript: { engine: "mines", usedFreeSpin: false },
  });
  if (!round) throw new Error("Testaufbau fehlgeschlagen.");
  return round;
}

async function seedBlackjackRound(db: TestDatabase, opts: { id?: string; seed?: number; stakeMinor?: number } = {}) {
  const modeId = await seedMode(db, "blackjack", "g-blackjack-demo");
  await seedUserAndWallet(db);
  const stakeMinor = opts.stakeMinor ?? 200;
  await debitStakeWithLedger(db, USER_ID, stakeMinor);
  const round = await insertOpenRound(db, {
    id: opts.id ?? "r1",
    userId: USER_ID,
    gameModeId: modeId,
    stakeMinor,
    seed: opts.seed ?? 999,
    maxReturnMinor: 1_000_000,
    idempotencyKey: `idem-${opts.id ?? "r1"}`,
    transcript: { engine: "blackjack", usedFreeSpin: false },
  });
  if (!round) throw new Error("Testaufbau fehlgeschlagen.");
  return round;
}

describe("applyRoundAction — Mines", () => {
  test("eine gültige reveal-Aktion (seq 1) liefert eine offene Antwort ohne Minenpositionen", async () => {
    const db = await createTestDatabase();
    const round = await seedMinesRound(db);
    const positions = minePositions(round.seed, 3);
    const safeCell = [...Array(25).keys()].find((c) => !positions.includes(c))!;

    const result = await applyRoundAction(db, { userId: USER_ID, roundId: round.id, seq: 1, action: "reveal", payload: { cell: safeCell } });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.status).toBe("open");
    expect(result.data.state).not.toHaveProperty("positions");
    expect(result.data.state).not.toHaveProperty("hitCell");
  });

  test("reveal auf eine Mine schließt die Runde ab, bucht returnMinor 0 und zeigt danach alle Positionen", async () => {
    const db = await createTestDatabase();
    const round = await seedMinesRound(db);
    const positions = minePositions(round.seed, 3);
    const mineCell = positions[0]!;

    const result = await applyRoundAction(db, { userId: USER_ID, roundId: round.id, seq: 1, action: "reveal", payload: { cell: mineCell } });

    expect(result.ok).toBe(true);
    if (!result.ok || result.data.status !== "settled") throw new Error("erwartet: settled");
    expect(result.data.returnMinor).toBe(0);
    expect(result.data.netMinor).toBe(-100);
    expect(result.data.state).toMatchObject({ positions, hitCell: mineCell });

    const wallet = await findWallet(db, USER_ID);
    expect(wallet?.balanceMinor).toBe(START_BALANCE_MINOR - 100);
    const ledgerSum = await sumLedgerAmountForUser(db, USER_ID);
    expect(ledgerSum).toBe(wallet?.balanceMinor);
  });

  test("cashOut nach zwei sicheren Feldern bucht die korrekte Rückgabe und schließt die Runde ab", async () => {
    const db = await createTestDatabase();
    const round = await seedMinesRound(db, { stakeMinor: 500 });
    const positions = minePositions(round.seed, 3);
    const safeCells = [...Array(25).keys()].filter((c) => !positions.includes(c)).slice(0, 2);

    const r1 = await applyRoundAction(db, { userId: USER_ID, roundId: round.id, seq: 1, action: "reveal", payload: { cell: safeCells[0] } });
    expect(r1.ok).toBe(true);
    if (r1.ok) expect(r1.data.status).toBe("open");

    const r2 = await applyRoundAction(db, { userId: USER_ID, roundId: round.id, seq: 2, action: "reveal", payload: { cell: safeCells[1] } });
    expect(r2.ok).toBe(true);

    const r3 = await applyRoundAction(db, { userId: USER_ID, roundId: round.id, seq: 3, action: "cashOut", payload: {} });
    expect(r3.ok).toBe(true);
    if (!r3.ok || r3.data.status !== "settled") throw new Error("erwartet: settled");
    expect(r3.data.returnMinor).toBeGreaterThan(0);

    const wallet = await findWallet(db, USER_ID);
    expect(wallet?.balanceMinor).toBe(START_BALANCE_MINOR - 500 + r3.data.returnMinor);
  });

  test("Wiedergabe: aus (stakeMinor, seed, actions[]) unabhängig neu aufgelöst ergibt exakt return_minor", async () => {
    const db = await createTestDatabase();
    const round = await seedMinesRound(db, { stakeMinor: 250 });
    const positions = minePositions(round.seed, 3);
    const safeCells = [...Array(25).keys()].filter((c) => !positions.includes(c)).slice(0, 3);

    await applyRoundAction(db, { userId: USER_ID, roundId: round.id, seq: 1, action: "reveal", payload: { cell: safeCells[0] } });
    await applyRoundAction(db, { userId: USER_ID, roundId: round.id, seq: 2, action: "reveal", payload: { cell: safeCells[1] } });
    const settled = await applyRoundAction(db, { userId: USER_ID, roundId: round.id, seq: 3, action: "cashOut", payload: {} });
    expect(settled.ok).toBe(true);
    if (!settled.ok || settled.data.status !== "settled") throw new Error("erwartet: settled");

    // Unabhängig von round-action-service.ts: NUR aus (seed, stakeMinor) und dem gespeicherten
    // Aktionsprotokoll neu aufgelöst — bewusst dieselben, aber SEPARAT aufgerufenen Adapter-
    // Funktionen, kein Zugriff auf den bereits gebuchten Betrag.
    const persistedRound = await findByIdempotencyKey(db, USER_ID, `idem-${round.id}`);
    const actions = await findActionsForRound(db, round.id);
    expect(persistedRound).not.toBeNull();
    if (!persistedRound) return;

    let replayed = startMinesRoundState({ seed: persistedRound.seed, stakeMinor: persistedRound.stakeMinor, betKey: persistedRound.betKey });
    for (const a of actions) {
      replayed = applyMinesAction(replayed, a.action, a.payload, { seed: persistedRound.seed });
    }
    const replayedSettlement = settleMinesRound(replayed, persistedRound.stakeMinor);

    expect(replayedSettlement.returnMinor).toBe(persistedRound.returnMinor);
    expect(replayedSettlement.returnMinor).toBe(settled.data.returnMinor);
  });

  test("Idempotenz: dieselbe Aktion (gleiche seq, gleiches Payload) zweimal gesendet wirkt genau einmal", async () => {
    const db = await createTestDatabase();
    const round = await seedMinesRound(db);
    const positions = minePositions(round.seed, 3);
    const safeCell = [...Array(25).keys()].find((c) => !positions.includes(c))!;

    const first = await applyRoundAction(db, { userId: USER_ID, roundId: round.id, seq: 1, action: "reveal", payload: { cell: safeCell } });
    const second = await applyRoundAction(db, { userId: USER_ID, roundId: round.id, seq: 1, action: "reveal", payload: { cell: safeCell } });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (first.ok && second.ok) expect(second.data).toEqual(first.data);
    const actions = await findActionsForRound(db, round.id);
    expect(actions).toHaveLength(1);
  });

  test("eine widersprüchliche Wiederholung derselben seq (anderes Feld) wird abgelehnt", async () => {
    const db = await createTestDatabase();
    const round = await seedMinesRound(db);
    const positions = minePositions(round.seed, 3);
    const safeCells = [...Array(25).keys()].filter((c) => !positions.includes(c));

    await applyRoundAction(db, { userId: USER_ID, roundId: round.id, seq: 1, action: "reveal", payload: { cell: safeCells[0] } });
    const conflict = await applyRoundAction(db, { userId: USER_ID, roundId: round.id, seq: 1, action: "reveal", payload: { cell: safeCells[1] } });

    expect(conflict).toEqual({ ok: false, code: "INVALID_STAKE" });
  });

  test("eine Aktion, die eine Position überspringt (seq 2 ohne vorheriges seq 1), wird abgelehnt", async () => {
    const db = await createTestDatabase();
    const round = await seedMinesRound(db);

    const result = await applyRoundAction(db, { userId: USER_ID, roundId: round.id, seq: 2, action: "reveal", payload: { cell: 0 } });

    expect(result).toEqual({ ok: false, code: "INVALID_STAKE" });
  });

  test("dasselbe Feld zweimal aufdecken wird abgelehnt", async () => {
    const db = await createTestDatabase();
    const round = await seedMinesRound(db);
    const positions = minePositions(round.seed, 3);
    const safeCell = [...Array(25).keys()].find((c) => !positions.includes(c))!;

    await applyRoundAction(db, { userId: USER_ID, roundId: round.id, seq: 1, action: "reveal", payload: { cell: safeCell } });
    const result = await applyRoundAction(db, { userId: USER_ID, roundId: round.id, seq: 2, action: "reveal", payload: { cell: safeCell } });

    expect(result).toEqual({ ok: false, code: "INVALID_STAKE" });
  });

  test("eine Aktion auf einer fremden Runde wird abgelehnt", async () => {
    const db = await createTestDatabase();
    const round = await seedMinesRound(db);
    await db.insert(user).values({ id: "u2", name: "Anderer Nutzer", email: "u2@example.com" });

    const result = await applyRoundAction(db, { userId: "u2", roundId: round.id, seq: 1, action: "reveal", payload: { cell: 0 } });

    expect(result).toEqual({ ok: false, code: "NO_PENDING_ROUND" });
  });

  test("eine Aktion auf einer bereits abgeschlossenen Runde wird abgelehnt", async () => {
    const db = await createTestDatabase();
    const round = await seedMinesRound(db);
    const positions = minePositions(round.seed, 3);
    const mineCell = positions[0]!;
    await applyRoundAction(db, { userId: USER_ID, roundId: round.id, seq: 1, action: "reveal", payload: { cell: mineCell } });

    const result = await applyRoundAction(db, { userId: USER_ID, roundId: round.id, seq: 2, action: "reveal", payload: { cell: 1 } });

    expect(result).toEqual({ ok: false, code: "NO_PENDING_ROUND" });
  });

  test("ein manipulierter Client, der eine unbekannte Runden-ID angibt, bekommt NO_PENDING_ROUND", async () => {
    const db = await createTestDatabase();
    await seedMinesRound(db);

    const result = await applyRoundAction(db, { userId: USER_ID, roundId: "does-not-exist", seq: 1, action: "reveal", payload: { cell: 0 } });

    expect(result).toEqual({ ok: false, code: "NO_PENDING_ROUND" });
  });
});

describe("applyRoundAction — Blackjack (Zusatzeinsatz)", () => {
  test("double bucht den Zusatzeinsatz als eigene Ledger-Buchung mit derselben Runden-ID", async () => {
    // Seed suchen, unter dem "double" nach dem Austeilen zulässig ist (kein natürlicher Blackjack).
    let found: { db: TestDatabase; round: Awaited<ReturnType<typeof seedBlackjackRound>> } | null = null;
    for (let seed = 1; seed < 200 && !found; seed++) {
      const candidateDb = await createTestDatabase();
      const round = await seedBlackjackRound(candidateDb, { seed, stakeMinor: 200 });
      const result = await applyRoundAction(candidateDb, { userId: USER_ID, roundId: round.id, seq: 1, action: "double", payload: {} });
      if (result.ok) found = { db: candidateDb, round };
    }
    expect(found).not.toBeNull();
    if (!found) return;

    // Grundeinsatz (200, aus dem Testaufbau) und Zusatzeinsatz (double, ebenfalls 200) sind zwei
    // getrennte bet-Buchungen mit derselben roundId — kein zusammengefasster Einzeleintrag.
    const entries = await listLedgerEntries(found.db, USER_ID, 10);
    const betEntries = entries.filter((e) => e.type === "bet" && e.roundId === found!.round.id);
    expect(betEntries).toHaveLength(1); // die zweite (Zusatz-)Buchung — der Grundeinsatz kam ohne roundId aus dem Testaufbau.
    expect(betEntries[0]?.amountMinor).toBe(-200);
  });

  /**
   * Serverseitiges Gegenstück zu einer entfernten Aussage aus dem früheren, lokalen
   * RAISE_ROUND_STAKE-Pfad (state/wallet-reducer.ts, vor Phase 3b): eine Erhöhung ohne Deckung
   * wird abgelehnt, ohne den Kontostand zu verändern. checkRaiseAllowed selbst (die Vierfach-
   * Obergrenze) ist als reine Funktion bereits vollständig in lib/wallet-policy.test.ts geprüft —
   * hier wird bewiesen, dass round-action-service.ts sie tatsächlich mit dem echten Kontostand
   * verdrahtet (INSUFFICIENT_FUNDS aus debitForStake, nicht nur aus der reinen Regel).
   */
  test("double ohne ausreichende Deckung wird abgelehnt, ohne den Kontostand zu verändern", async () => {
    // Seed suchen, unter dem "double" grundsätzlich zulässig ist (derselbe Suchlauf wie oben).
    let workingSeed: number | null = null;
    for (let seed = 1; seed < 200 && workingSeed === null; seed++) {
      const probeDb = await createTestDatabase();
      const round = await seedBlackjackRound(probeDb, { seed, stakeMinor: 200 });
      const probe = await applyRoundAction(probeDb, { userId: USER_ID, roundId: round.id, seq: 1, action: "double", payload: {} });
      if (probe.ok) workingSeed = seed;
    }
    expect(workingSeed).not.toBeNull();
    if (workingSeed === null) return;

    const db = await createTestDatabase();
    const round = await seedBlackjackRound(db, { seed: workingSeed, stakeMinor: 200 });
    // Guthaben bis auf 100 herunterbuchen — der Zusatzeinsatz beim Verdoppeln (200) übersteigt das.
    const before = await findWallet(db, USER_ID);
    if (!before) throw new Error("Testaufbau fehlgeschlagen: Wallet fehlt.");
    await debitForStake(db, USER_ID, { fromBonusMinor: 0, fromBalanceMinor: before.balanceMinor - 100 });

    const result = await applyRoundAction(db, { userId: USER_ID, roundId: round.id, seq: 1, action: "double", payload: {} });

    expect(result).toEqual({ ok: false, code: "INSUFFICIENT_FUNDS" });
    const after = await findWallet(db, USER_ID);
    expect(after?.balanceMinor).toBe(100); // unverändert — kein stiller Teilabzug
  });

  test("Responsible-Gaming-Sperre (Auftrag „Server statt Client“): ein selbstgesperrter Nutzer kann double (Zusatzeinsatz) nicht buchen", async () => {
    // Seed suchen, unter dem "double" grundsätzlich zulässig ist (derselbe Suchlauf wie oben).
    let workingSeed: number | null = null;
    for (let seed = 1; seed < 200 && workingSeed === null; seed++) {
      const probeDb = await createTestDatabase();
      const round = await seedBlackjackRound(probeDb, { seed, stakeMinor: 200 });
      const probe = await applyRoundAction(probeDb, { userId: USER_ID, roundId: round.id, seq: 1, action: "double", payload: {} });
      if (probe.ok) workingSeed = seed;
    }
    expect(workingSeed).not.toBeNull();
    if (workingSeed === null) return;

    const db = await createTestDatabase();
    const round = await seedBlackjackRound(db, { seed: workingSeed, stakeMinor: 200 });
    const { activateSelfExclusion } = await import("@/server/repositories/rg-settings-repository");
    await activateSelfExclusion(db, USER_ID, new Date().toISOString());
    const before = await findWallet(db, USER_ID);

    const result = await applyRoundAction(db, { userId: USER_ID, roundId: round.id, seq: 1, action: "double", payload: {} });

    expect(result).toEqual({ ok: false, code: "RG_BLOCKED" });
    const after = await findWallet(db, USER_ID);
    expect(after?.balanceMinor).toBe(before?.balanceMinor); // kein Zusatzeinsatz gebucht
    const entries = await listLedgerEntries(db, USER_ID, 10);
    expect(entries.some((e) => e.type === "bet" && e.roundId === round.id)).toBe(false);
  });

  test("hit nach stand wird abgelehnt", async () => {
    const db = await createTestDatabase();
    let seed = 1;
    let round = await seedBlackjackRound(db, { seed });
    let standResult = await applyRoundAction(db, { userId: USER_ID, roundId: round.id, seq: 1, action: "stand", payload: {} });
    // Falls die erste Runde bereits durch natürlichen Blackjack "done" ist, ist "stand" selbst
    // schon ungültig — dann mit einem neuen Seed/neuer Runde erneut versuchen.
    while (!standResult.ok) {
      seed += 1;
      const db2 = await createTestDatabase();
      round = await seedBlackjackRound(db2, { id: `r-${seed}`, seed });
      standResult = await applyRoundAction(db2, { userId: USER_ID, roundId: round.id, seq: 1, action: "stand", payload: {} });
      if (standResult.ok) {
        const hitAfterStand = await applyRoundAction(db2, { userId: USER_ID, roundId: round.id, seq: 2, action: "hit", payload: {} });
        expect(hitAfterStand).toEqual({ ok: false, code: "INVALID_STAKE" });
        return;
      }
    }
  });

  test("stand schließt die Runde ab und liefert das Ergebnis je Hand in detail.hands (Client zeichnet nur, was der Server liefert)", async () => {
    let round: Awaited<ReturnType<typeof seedBlackjackRound>> | null = null;
    let settled: Extract<Awaited<ReturnType<typeof applyRoundAction>>, { ok: true }> | null = null;
    for (let seed = 1; seed < 200 && !settled; seed++) {
      const candidateDb = await createTestDatabase();
      const r = await seedBlackjackRound(candidateDb, { seed });
      const result = await applyRoundAction(candidateDb, { userId: USER_ID, roundId: r.id, seq: 1, action: "stand", payload: {} });
      if (result.ok && result.data.status === "settled") {
        round = r;
        settled = result;
      }
    }
    expect(round).not.toBeNull();
    expect(settled).not.toBeNull();
    if (!settled || settled.data.status !== "settled") return;
    expect(settled.data.detail).toBeDefined();
    expect(Array.isArray(settled.data.detail?.hands)).toBe(true);
    expect((settled.data.detail?.hands as unknown[]).length).toBe(1);
  });
});
