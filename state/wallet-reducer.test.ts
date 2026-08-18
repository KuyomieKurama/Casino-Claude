import { describe, expect, it } from "vitest";
import { availableMinor, createInitialWalletState, toPersistedWallet, walletReducer, type WalletCtx, type WalletState } from "./wallet-reducer";
import { mulberry32 } from "@/lib/rng";
import { START_BALANCE_MINOR } from "@/lib/constants";
import { sampleTransactions } from "@/data/mock-history";

/**
 * Seit Phase 3b bucht dieser Reducer keine Runden mehr (kein START_ROUND/SETTLE_ROUND/
 * RAISE_ROUND_STAKE — der lokale Rundenpfad wurde entfernt, siehe state/wallet-reducer.ts).
 * Getestet werden hier nur noch die verbliebenen Aktionen: TOP_UP, RESET, GRANT_BONUS, HYDRATE,
 * CLEAR_REJECTION, SERVER_WALLET_SYNC. Die fachlichen Aussagen der entfernten Tests leben, wo sie
 * weiterhin gelten, serverseitig fort:
 *  - "Einsatz über Bestand wird abgelehnt, nicht gekappt" → server/rounds/round-service.test.ts
 *    ("Invariante 1"), server/rounds/interactive-round-service.test.ts ("Invariante 1"), sowie
 *    lib/wallet-policy.test.ts::checkFundsAvailable (Grenzfall exakt am Bestand).
 *  - "genau eine Buchung je Rundenstart, auch bei doppeltem Versuch" →
 *    server/rounds/round-service.test.ts ("Idempotenz"),
 *    server/rounds/interactive-round-service.test.ts ("Idempotenz"),
 *    server/rounds/round-action-service.test.ts ("Idempotenz").
 *  - "Bonusguthaben wird vor dem Demoguthaben eingesetzt" →
 *    lib/wallet-policy.test.ts::splitStakeAcrossBalances (reine Funktion) UND
 *    server/rounds/round-service.test.ts ("Bonusguthaben wird vor dem Demo-Guthaben eingesetzt",
 *    neu ergänzt — bewiesen, dass der Server dieselbe Regel tatsächlich verdrahtet).
 *  - "Freirunde kostet kein Guthaben, verbraucht aber eine Freirunde" →
 *    server/rounds/interactive-round-service.test.ts ("Freirunde").
 *  - "Einsatz außerhalb der Grenzen wird abgelehnt (INVALID_STAKE)" →
 *    server/rounds/round-service.test.ts, server/rounds/interactive-round-service.test.ts, sowie
 *    lib/wallet-policy.test.ts::checkStakeRange.
 *  - "interaktive Runde: Ergebnis bis zur Obergrenze wird akzeptiert, darüber abgelehnt" →
 *    strukturell überholt: der Server ERRECHNET das Ergebnis selbst aus Seed und Aktionsprotokoll
 *    und nimmt es nie vom Client entgegen (kein "override" möglich) — siehe die Wiedergabetests in
 *    server/rounds/interactive-round-service.test.ts und server/rounds/round-action-service.test.ts.
 *    lib/wallet-policy.test.ts::checkSettleReturnOverride prüft die zugrundeliegende reine Regel
 *    weiterhin vollständig.
 *  - "Zusatzeinsatz (Verdoppeln/Teilen) wird gebucht, respektiert die Vierfach-Obergrenze und lehnt
 *    ohne Deckung ab" → server/rounds/round-action-service.test.ts ("double bucht den
 *    Zusatzeinsatz...", "double ohne ausreichende Deckung wird abgelehnt...", neu ergänzt) sowie
 *    lib/wallet-policy.test.ts::checkRaiseAllowed/computeRaisedMaxReturn (reine Regel, inklusive
 *    Vierfach-Obergrenze).
 *  - "RG-Sperre blockiert Rundenstart" → lib/wallet-policy.test.ts::checkRgNotBlocked (reine
 *    Regel). Eine serverseitige RG-Prüfung existiert bewusst nicht (Auftrag: „Responsible Gaming
 *    serverseitig" ist ausdrücklich nicht Teil dieses Auftrags) — das ist kein neuer Verlust durch
 *    diese Bereinigung: der bisherige lokale START_ROUND-Pfad wurde von keinem Spiel mehr
 *    aufgerufen, RG-Blockierung wirkte für den tatsächlich genutzten Server-Pfad schon vorher nur
 *    auf UI-Ebene (useRound.ts::canStart), nicht als zweite Absicherung hier.
 *  - "eine unterbrochene lokale Runde wird beim Reload abgeschlossen" → entfällt ersatzlos: es gibt
 *    seit Phase 3b keinen lokalen Rundenzustand mehr, der beim Laden abzuschließen wäre.
 */

const ctx = (over: Partial<WalletCtx> = {}): WalletCtx => ({
  userId: "guest",
  now: "2026-08-15T10:00:00.000Z",
  rgBlocked: false,
  ...over,
});

const fresh = () => ({ ...createInitialWalletState(), hydrated: true });

/** Prüft die Kette: jede Transaktion trägt das Gesamtguthaben nach dem Vorgang, seq ist streng monoton. */
function assertChain(state: WalletState) {
  let prevSeq = 0;
  let running: number | null = null;
  for (const tx of state.transactions) {
    expect(tx.seq).toBeGreaterThan(prevSeq);
    prevSeq = tx.seq;
    if (running !== null) {
      expect(tx.balanceAfterMinor).toBe(running + tx.amountMinor);
    }
    running = tx.balanceAfterMinor;
    expect(tx.balanceAfterMinor).toBeGreaterThanOrEqual(0);
  }
  if (running !== null) expect(running).toBe(availableMinor(state.wallet));
}

describe("Wallet-Reducer — Invarianten (Aufladen, Zurücksetzen, Bonusgutschrift)", () => {
  it("Guthaben wird nie negativ — 500 zufällige Aktionsfolgen (Property-Test)", () => {
    const rng = mulberry32(20260815);
    for (let run = 0; run < 500; run++) {
      let s = fresh();
      const steps = 20 + Math.floor(rng() * 40);
      for (let i = 0; i < steps; i++) {
        const pick = rng();
        const c = ctx({ rgBlocked: rng() < 0.05 });
        if (pick < 0.4) {
          s = walletReducer(s, { type: "TOP_UP", amountMinor: [10_000, 50_000][Math.floor(rng() * 2)] ?? 10_000, ctx: c });
        } else if (pick < 0.7) {
          s = walletReducer(s, { type: "RESET", ctx: c });
        } else if (pick < 0.9) {
          s = walletReducer(s, { type: "GRANT_BONUS", bonusMinor: Math.floor(rng() * 5000), freeSpins: Math.floor(rng() * 3), sourceId: "p", ctx: c });
        } else {
          s = walletReducer(s, { type: "CLEAR_REJECTION" });
        }
        expect(s.wallet.demoBalanceMinor).toBeGreaterThanOrEqual(0);
        expect(s.wallet.bonusBalanceMinor).toBeGreaterThanOrEqual(0);
        expect(s.wallet.freeSpins).toBeGreaterThanOrEqual(0);
        expect(Number.isInteger(s.wallet.demoBalanceMinor)).toBe(true);
      }
      assertChain(s);
    }
  });

  it("balanceAfterMinor stimmt nach jeder Transaktionskette", () => {
    let s = fresh();
    s = walletReducer(s, { type: "TOP_UP", amountMinor: 10_000, ctx: ctx() });
    s = walletReducer(s, { type: "GRANT_BONUS", bonusMinor: 5000, freeSpins: 0, sourceId: "p-weekend", ctx: ctx() });
    s = walletReducer(s, { type: "TOP_UP", amountMinor: 50_000, ctx: ctx() });
    s = walletReducer(s, { type: "RESET", ctx: ctx() });
    expect(s.transactions.map((t) => t.type)).toEqual(["demo_credit", "bonus_grant", "demo_credit", "reset"]);
    assertChain(s);
    expect(availableMinor(s.wallet)).toBe(START_BALANCE_MINOR);
    // Beispielhistorie ist ebenfalls eine gültige Kette
    const seeded = { ...createInitialWalletState(sampleTransactions), hydrated: true };
    assertChain(seeded);
  });

  it("Ungültiger Betrag (negativ, nicht ganzzahlig) wird bei TOP_UP abgelehnt", () => {
    const s0 = fresh();
    expect(walletReducer(s0, { type: "TOP_UP", amountMinor: -100, ctx: ctx() }).lastRejection?.code).toBe("INVALID_STAKE");
    expect(walletReducer(s0, { type: "TOP_UP", amountMinor: 0, ctx: ctx() }).lastRejection?.code).toBe("INVALID_STAKE");
    expect(walletReducer(s0, { type: "TOP_UP", amountMinor: 10.5, ctx: ctx() }).lastRejection?.code).toBe("INVALID_STAKE");
  });

  it("TOP_UP über die Obergrenze hinaus wird abgelehnt, der Bestand bleibt unverändert", () => {
    const s0 = fresh();
    const huge = walletReducer(s0, { type: "TOP_UP", amountMinor: 999_999_999_99, ctx: ctx() });
    expect(huge.lastRejection?.code).toBe("MAX_BALANCE");
    expect(huge.wallet.demoBalanceMinor).toBe(s0.wallet.demoBalanceMinor);
  });

  it("GRANT_BONUS mit ungültigen Werten wird abgelehnt, eine reine Freirunden-Gutschrift von 0 bleibt ein No-Op", () => {
    const s0 = fresh();
    expect(walletReducer(s0, { type: "GRANT_BONUS", bonusMinor: -1, freeSpins: 0, sourceId: "p", ctx: ctx() }).lastRejection?.code).toBe("INVALID_STAKE");
    expect(walletReducer(s0, { type: "GRANT_BONUS", bonusMinor: 0, freeSpins: -1, sourceId: "p", ctx: ctx() }).lastRejection?.code).toBe("INVALID_STAKE");
    const noop = walletReducer(s0, { type: "GRANT_BONUS", bonusMinor: 0, freeSpins: 0, sourceId: "p", ctx: ctx() });
    expect(noop).toBe(s0);
  });

  it("CLEAR_REJECTION räumt eine vorhandene Ablehnung auf und ist ansonsten ein No-Op", () => {
    const rejected = walletReducer(fresh(), { type: "TOP_UP", amountMinor: -1, ctx: ctx() });
    expect(rejected.lastRejection).not.toBeNull();
    const cleared = walletReducer(rejected, { type: "CLEAR_REJECTION" });
    expect(cleared.lastRejection).toBeNull();
    // Ohne vorhandene Ablehnung liefert CLEAR_REJECTION denselben State zurück (kein neues Objekt).
    const s0 = fresh();
    expect(walletReducer(s0, { type: "CLEAR_REJECTION" })).toBe(s0);
  });

  it("SERVER_WALLET_SYNC übernimmt die Saldofelder, ohne eine Transaktion zu buchen", () => {
    let s = fresh();
    s = walletReducer(s, { type: "TOP_UP", amountMinor: 10_000, ctx: ctx() });
    const before = s.transactions.length;
    const synced = walletReducer(s, { type: "SERVER_WALLET_SYNC", wallet: { demoBalanceMinor: 55_000, bonusBalanceMinor: 200, freeSpins: 2 } });
    expect(synced.wallet.demoBalanceMinor).toBe(55_000);
    expect(synced.wallet.bonusBalanceMinor).toBe(200);
    expect(synced.wallet.freeSpins).toBe(2);
    expect(synced.transactions).toHaveLength(before); // reiner Anzeige-Abgleich, keine neue Buchung
  });

  it("Hydration: defekte Scheibe führt zu Defaults", () => {
    const a = walletReducer(createInitialWalletState(), { type: "HYDRATE", slice: { wallet: { demoBalanceMinor: -5 } }, ctx: ctx() });
    expect(a.hydrated).toBe(true);
    expect(a.wallet.demoBalanceMinor).toBe(START_BALANCE_MINOR);
    const b = walletReducer(createInitialWalletState(), { type: "HYDRATE", slice: "kaputt", ctx: ctx() });
    expect(b.wallet.demoBalanceMinor).toBe(START_BALANCE_MINOR);
  });

  it("Hydration: serverWallet überschreibt einen veralteten LocalStorage-Saldo (Auftrag: durchgängig der Serverstand)", () => {
    const stale = fresh();
    const persisted = JSON.parse(JSON.stringify(toPersistedWallet({ ...stale, wallet: { ...stale.wallet, demoBalanceMinor: START_BALANCE_MINOR - 100 } })));
    const serverWallet = { demoBalanceMinor: 42_000, bonusBalanceMinor: 500, freeSpins: 3 };

    const rehydrated = walletReducer(createInitialWalletState(), { type: "HYDRATE", slice: persisted, ctx: ctx(), serverWallet });

    expect(rehydrated.wallet.demoBalanceMinor).toBe(42_000);
    expect(rehydrated.wallet.bonusBalanceMinor).toBe(500);
    expect(rehydrated.wallet.freeSpins).toBe(3);
  });

  it("Hydration: serverWallet gewinnt auch bei einer defekten Scheibe (kein Rückfall auf den hartkodierten Default)", () => {
    const serverWallet = { demoBalanceMinor: 7_500, bonusBalanceMinor: 0, freeSpins: 0 };
    const a = walletReducer(createInitialWalletState(), { type: "HYDRATE", slice: "kaputt", ctx: ctx(), serverWallet });
    expect(a.wallet.demoBalanceMinor).toBe(7_500);
  });

  it("Hydration ohne serverWallet verhält sich unverändert (bestehende Aufrufer bleiben kompatibel)", () => {
    const persisted = JSON.parse(JSON.stringify(toPersistedWallet(fresh())));
    const rehydrated = walletReducer(createInitialWalletState(), { type: "HYDRATE", slice: persisted, ctx: ctx() });
    expect(rehydrated.wallet.demoBalanceMinor).toBe(START_BALANCE_MINOR);
  });

  it("toPersistedWallet liefert keine Rundenfelder mehr (der lokale Rundenpfad wurde entfernt)", () => {
    const persisted = toPersistedWallet(fresh());
    expect(persisted).not.toHaveProperty("pendingRound");
  });
});
