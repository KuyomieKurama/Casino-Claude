import { describe, expect, it } from "vitest";
import {
  availableMinor,
  createInitialWalletState,
  toPersistedWallet,
  walletReducer,
  type StartRoundInput,
  type WalletCtx,
  type WalletState,
} from "./wallet-reducer";
import { mulberry32 } from "@/lib/rng";
import { START_BALANCE_MINOR } from "@/lib/constants";
import { sampleTransactions } from "@/data/mock-history";

const ctx = (over: Partial<WalletCtx> = {}): WalletCtx => ({
  userId: "guest",
  now: "2026-08-15T10:00:00.000Z",
  rgBlocked: false,
  ...over,
});

const round = (over: Partial<StartRoundInput> = {}): StartRoundInput => ({
  roundId: "r1",
  gameId: "g-neon-nights",
  stakeMinor: 100,
  minStakeMinor: 10,
  maxStakeMinor: 1000,
  returnMinor: 200,
  outcomeKey: "small",
  seed: 1,
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

describe("Wallet-Reducer — Invarianten", () => {
  it("#1 Einsatz über Guthaben wird abgelehnt, Kontostand unverändert", () => {
    const s0 = fresh();
    const s1 = walletReducer(s0, { type: "START_ROUND", input: round({ stakeMinor: START_BALANCE_MINOR + 1, maxStakeMinor: 10 ** 9 }), ctx: ctx() });
    expect(s1.wallet.demoBalanceMinor).toBe(START_BALANCE_MINOR);
    expect(s1.transactions).toHaveLength(0);
    expect(s1.wallet.roundInFlight).toBe(false);
    expect(s1.lastRejection?.code).toBe("INSUFFICIENT_FUNDS");
  });

  it("#1b exakter Bestand ist erlaubt, ein Hundertstel mehr nicht (keine Kappung)", () => {
    const s0 = fresh();
    const ok = walletReducer(s0, { type: "START_ROUND", input: round({ stakeMinor: START_BALANCE_MINOR, maxStakeMinor: 10 ** 9 }), ctx: ctx() });
    expect(ok.wallet.demoBalanceMinor).toBe(0);
    expect(ok.lastRejection).toBeNull();
    const settled = walletReducer(ok, { type: "SETTLE_ROUND", roundId: "r1", ctx: ctx() });
    const tooMuch = walletReducer(settled, { type: "START_ROUND", input: round({ roundId: "r2", stakeMinor: settled.wallet.demoBalanceMinor + 1, maxStakeMinor: 10 ** 9 }), ctx: ctx() });
    expect(tooMuch.lastRejection?.code).toBe("INSUFFICIENT_FUNDS");
    expect(tooMuch.wallet.demoBalanceMinor).toBe(settled.wallet.demoBalanceMinor);
  });

  it("#2 Guthaben wird nie negativ — 500 zufällige Aktionsfolgen (Property-Test)", () => {
    const rng = mulberry32(20260815);
    for (let run = 0; run < 500; run++) {
      let s = fresh();
      let roundNo = 0;
      const steps = 20 + Math.floor(rng() * 40);
      for (let i = 0; i < steps; i++) {
        const pick = rng();
        const c = ctx({ rgBlocked: rng() < 0.05 });
        if (pick < 0.45) {
          const stake = Math.floor(rng() * 200_000);
          const mult = [0, 0.5, 1, 2, 5, 10, 25, 100][Math.floor(rng() * 8)] ?? 0;
          s = walletReducer(s, {
            type: "START_ROUND",
            input: round({ roundId: `r${++roundNo}`, stakeMinor: stake, minStakeMinor: 0, maxStakeMinor: 10 ** 9, returnMinor: Math.round(stake * mult) }),
            ctx: c,
          });
        } else if (pick < 0.75) {
          s = walletReducer(s, { type: "SETTLE_ROUND", roundId: s.pendingRound?.roundId ?? "none", ctx: c });
        } else if (pick < 0.85) {
          s = walletReducer(s, { type: "TOP_UP", amountMinor: [10_000, 50_000][Math.floor(rng() * 2)] ?? 10_000, ctx: c });
        } else if (pick < 0.92) {
          s = walletReducer(s, { type: "RESET", ctx: c });
        } else {
          s = walletReducer(s, { type: "GRANT_BONUS", bonusMinor: Math.floor(rng() * 5000), freeSpins: Math.floor(rng() * 3), sourceId: "p", ctx: c });
        }
        expect(s.wallet.demoBalanceMinor).toBeGreaterThanOrEqual(0);
        expect(s.wallet.bonusBalanceMinor).toBeGreaterThanOrEqual(0);
        expect(s.wallet.freeSpins).toBeGreaterThanOrEqual(0);
        expect(Number.isInteger(s.wallet.demoBalanceMinor)).toBe(true);
      }
      assertChain(s);
    }
  });

  it("#3 balanceAfterMinor stimmt nach jeder Transaktionskette", () => {
    let s = fresh();
    s = walletReducer(s, { type: "TOP_UP", amountMinor: 10_000, ctx: ctx() });
    s = walletReducer(s, { type: "START_ROUND", input: round({ stakeMinor: 250, returnMinor: 125 }), ctx: ctx() });
    s = walletReducer(s, { type: "SETTLE_ROUND", roundId: "r1", ctx: ctx() });
    s = walletReducer(s, { type: "GRANT_BONUS", bonusMinor: 5000, freeSpins: 0, sourceId: "p-weekend", ctx: ctx() });
    s = walletReducer(s, { type: "START_ROUND", input: round({ roundId: "r2", stakeMinor: 1000, returnMinor: 0 }), ctx: ctx() });
    s = walletReducer(s, { type: "SETTLE_ROUND", roundId: "r2", ctx: ctx() });
    s = walletReducer(s, { type: "RESET", ctx: ctx() });
    expect(s.transactions.map((t) => t.type)).toEqual(["demo_credit", "demo_bet", "demo_win", "bonus_grant", "demo_bet", "demo_win", "reset"]);
    assertChain(s);
    expect(availableMinor(s.wallet)).toBe(START_BALANCE_MINOR);
    // Beispielhistorie ist ebenfalls eine gültige Kette
    const seeded = { ...createInitialWalletState(sampleTransactions), hydrated: true };
    assertChain(seeded);
  });

  it("#3b Bonusguthaben wird zuerst eingesetzt, beides bleibt ≥ 0", () => {
    let s = fresh();
    s = walletReducer(s, { type: "GRANT_BONUS", bonusMinor: 300, freeSpins: 0, sourceId: "p", ctx: ctx() });
    s = walletReducer(s, { type: "START_ROUND", input: round({ stakeMinor: 500, returnMinor: 0 }), ctx: ctx() });
    expect(s.wallet.bonusBalanceMinor).toBe(0);
    expect(s.wallet.demoBalanceMinor).toBe(START_BALANCE_MINOR - 200);
    expect(s.transactions.at(-1)?.balanceAfterMinor).toBe(START_BALANCE_MINOR - 200);
  });

  it("#4 Doppelter Rundenstart erzeugt genau eine Buchung", () => {
    let s = fresh();
    s = walletReducer(s, { type: "START_ROUND", input: round(), ctx: ctx() });
    s = walletReducer(s, { type: "START_ROUND", input: round({ roundId: "r1-dup" }), ctx: ctx() });
    s = walletReducer(s, { type: "START_ROUND", input: round({ roundId: "r1-dup2" }), ctx: ctx() });
    expect(s.transactions.filter((t) => t.type === "demo_bet")).toHaveLength(1);
    expect(s.wallet.demoBalanceMinor).toBe(START_BALANCE_MINOR - 100);
    expect(s.wallet.roundInFlight).toBe(true);
    expect(s.lastRejection?.code).toBe("ROUND_IN_FLIGHT");
    // Auch Zurücksetzen ist während einer laufenden Runde nicht möglich
    const reset = walletReducer(s, { type: "RESET", ctx: ctx() });
    expect(reset.lastRejection?.code).toBe("ROUND_IN_FLIGHT");
    // Nach dem Abschluss ist eine neue Runde möglich, das Ergebnis ist genau einmal gebucht
    s = walletReducer(s, { type: "SETTLE_ROUND", roundId: "r1", ctx: ctx() });
    s = walletReducer(s, { type: "SETTLE_ROUND", roundId: "r1", ctx: ctx() });
    expect(s.transactions.filter((t) => t.type === "demo_win")).toHaveLength(1);
    expect(s.wallet.roundInFlight).toBe(false);
    expect(s.wallet.demoBalanceMinor).toBe(START_BALANCE_MINOR + 100);
  });

  it("#11 Aktive Selbstsperre/Pause blockiert alle einsatzbezogenen Aktionen", () => {
    const s0 = fresh();
    const blocked = ctx({ rgBlocked: true });
    const a = walletReducer(s0, { type: "START_ROUND", input: round(), ctx: blocked });
    expect(a.lastRejection?.code).toBe("RG_BLOCKED");
    expect(a.transactions).toHaveLength(0);
    expect(a.wallet).toEqual(s0.wallet);
    // Freirunden sind ebenfalls einsatzbezogen
    const withSpins = walletReducer(s0, { type: "GRANT_BONUS", bonusMinor: 0, freeSpins: 5, sourceId: "p", ctx: ctx() });
    const b = walletReducer(withSpins, { type: "START_ROUND", input: round({ useFreeSpin: true }), ctx: blocked });
    expect(b.lastRejection?.code).toBe("RG_BLOCKED");
    expect(b.wallet.freeSpins).toBe(5);
  });

  it("Ungültiger Einsatz (außerhalb min/max, nicht ganzzahlig) wird abgelehnt", () => {
    const s0 = fresh();
    expect(walletReducer(s0, { type: "START_ROUND", input: round({ stakeMinor: 5 }), ctx: ctx() }).lastRejection?.code).toBe("INVALID_STAKE");
    expect(walletReducer(s0, { type: "START_ROUND", input: round({ stakeMinor: 1001 }), ctx: ctx() }).lastRejection?.code).toBe("INVALID_STAKE");
    expect(walletReducer(s0, { type: "START_ROUND", input: round({ stakeMinor: 10.5 }), ctx: ctx() }).lastRejection?.code).toBe("INVALID_STAKE");
    expect(walletReducer(s0, { type: "TOP_UP", amountMinor: -100, ctx: ctx() }).lastRejection?.code).toBe("INVALID_STAKE");
  });

  it("Freirunde: kein Einsatz vom Guthaben, Freirundenzähler sinkt, Ergebnis wird gutgeschrieben", () => {
    let s = fresh();
    s = walletReducer(s, { type: "GRANT_BONUS", bonusMinor: 0, freeSpins: 2, sourceId: "p-welcome", ctx: ctx() });
    s = walletReducer(s, { type: "START_ROUND", input: round({ useFreeSpin: true, returnMinor: 300 }), ctx: ctx() });
    expect(s.wallet.freeSpins).toBe(1);
    expect(s.wallet.demoBalanceMinor).toBe(START_BALANCE_MINOR);
    expect(s.transactions.at(-1)?.type).toBe("free_spin");
    s = walletReducer(s, { type: "SETTLE_ROUND", roundId: "r1", ctx: ctx() });
    expect(s.wallet.demoBalanceMinor).toBe(START_BALANCE_MINOR + 300);
    assertChain(s);
  });

  it("Hydration: unterbrochene Runde wird abgeschlossen, roundInFlight ist danach false", () => {
    let s = fresh();
    s = walletReducer(s, { type: "START_ROUND", input: round({ returnMinor: 500 }), ctx: ctx() });
    const persisted = JSON.parse(JSON.stringify(toPersistedWallet(s)));
    const rehydrated = walletReducer(createInitialWalletState(), { type: "HYDRATE", slice: persisted, ctx: ctx({ now: "2026-08-15T11:00:00.000Z" }) });
    expect(rehydrated.hydrated).toBe(true);
    expect(rehydrated.wallet.roundInFlight).toBe(false);
    expect(rehydrated.pendingRound).toBeNull();
    expect(rehydrated.wallet.demoBalanceMinor).toBe(START_BALANCE_MINOR - 100 + 500);
    assertChain(rehydrated);
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

  it("Hydration: eine unterbrochene Runde wird zuerst lokal abgeschlossen, danach gewinnt trotzdem serverWallet", () => {
    let s = fresh();
    s = walletReducer(s, { type: "START_ROUND", input: round({ returnMinor: 500 }), ctx: ctx() });
    const persisted = JSON.parse(JSON.stringify(toPersistedWallet(s)));
    const serverWallet = { demoBalanceMinor: 999_000, bonusBalanceMinor: 0, freeSpins: 0 };

    const rehydrated = walletReducer(createInitialWalletState(), { type: "HYDRATE", slice: persisted, ctx: ctx(), serverWallet });

    expect(rehydrated.pendingRound).toBeNull();
    expect(rehydrated.wallet.roundInFlight).toBe(false);
    expect(rehydrated.wallet.demoBalanceMinor).toBe(999_000);
  });

  it("Hydration ohne serverWallet verhält sich unverändert (bestehende Aufrufer bleiben kompatibel)", () => {
    const persisted = JSON.parse(JSON.stringify(toPersistedWallet(fresh())));
    const rehydrated = walletReducer(createInitialWalletState(), { type: "HYDRATE", slice: persisted, ctx: ctx() });
    expect(rehydrated.wallet.demoBalanceMinor).toBe(START_BALANCE_MINOR);
  });
});

describe("Wallet-Reducer — interaktive Runden (Blackjack, Mines)", () => {
  const interactiveRound = (over: Partial<StartRoundInput> = {}): StartRoundInput => ({
    roundId: "ri1",
    gameId: "g-classic-blackjack",
    stakeMinor: 100,
    minStakeMinor: 50,
    maxStakeMinor: 5000,
    returnMinor: 0,
    outcomeKey: "pending",
    seed: 7,
    interactive: true,
    maxReturnMinor: 300,
    ...over,
  });

  it("akzeptiert ein abweichendes Ergebnis bis zur deklarierten Obergrenze", () => {
    let s = fresh();
    s = walletReducer(s, { type: "START_ROUND", input: interactiveRound(), ctx: ctx() });
    expect(s.pendingRound?.interactive).toBe(true);
    s = walletReducer(s, { type: "SETTLE_ROUND", roundId: "ri1", returnMinor: 250, ctx: ctx() });
    expect(s.wallet.demoBalanceMinor).toBe(START_BALANCE_MINOR - 100 + 250);
    expect(s.transactions.at(-1)?.amountMinor).toBe(250);
  });

  it("lehnt Ergebnisse über der Obergrenze ab — die UI kann keinen Betrag erfinden", () => {
    let s = fresh();
    s = walletReducer(s, { type: "START_ROUND", input: interactiveRound(), ctx: ctx() });
    const before = s.wallet.demoBalanceMinor;
    const rejected = walletReducer(s, { type: "SETTLE_ROUND", roundId: "ri1", returnMinor: 301, ctx: ctx() });
    expect(rejected.lastRejection?.code).toBe("RETURN_OUT_OF_RANGE");
    expect(rejected.wallet.demoBalanceMinor).toBe(before);
    expect(rejected.pendingRound).not.toBeNull();
    for (const bad of [-1, 1.5, Number.NaN]) {
      expect(walletReducer(s, { type: "SETTLE_ROUND", roundId: "ri1", returnMinor: bad, ctx: ctx() }).lastRejection?.code).toBe("RETURN_OUT_OF_RANGE");
    }
  });

  it("nicht-interaktive Runden ignorieren kein Ergebnis, sondern lehnen es ab", () => {
    let s = fresh();
    s = walletReducer(s, { type: "START_ROUND", input: round({ returnMinor: 200 }), ctx: ctx() });
    const rejected = walletReducer(s, { type: "SETTLE_ROUND", roundId: "r1", returnMinor: 5000, ctx: ctx() });
    expect(rejected.lastRejection?.code).toBe("RETURN_OUT_OF_RANGE");
    const settled = walletReducer(s, { type: "SETTLE_ROUND", roundId: "r1", ctx: ctx() });
    expect(settled.wallet.demoBalanceMinor).toBe(START_BALANCE_MINOR - 100 + 200);
  });

  it("interaktive Runde ohne gültige Obergrenze wird gar nicht erst gestartet", () => {
    const s = fresh();
    const a = walletReducer(s, { type: "START_ROUND", input: interactiveRound({ maxReturnMinor: undefined }), ctx: ctx() });
    expect(a.lastRejection?.code).toBe("RETURN_OUT_OF_RANGE");
    const b = walletReducer(s, { type: "START_ROUND", input: interactiveRound({ returnMinor: 500, maxReturnMinor: 300 }), ctx: ctx() });
    expect(b.lastRejection?.code).toBe("RETURN_OUT_OF_RANGE");
    expect(a.transactions).toHaveLength(0);
  });

  it("unterbrochene interaktive Runde wird beim Reload mit dem Startergebnis abgeschlossen", () => {
    let s = fresh();
    s = walletReducer(s, { type: "START_ROUND", input: interactiveRound({ returnMinor: 0 }), ctx: ctx() });
    const persisted = JSON.parse(JSON.stringify(toPersistedWallet(s)));
    const rehydrated = walletReducer(createInitialWalletState(), { type: "HYDRATE", slice: persisted, ctx: ctx() });
    expect(rehydrated.pendingRound).toBeNull();
    expect(rehydrated.wallet.roundInFlight).toBe(false);
    expect(rehydrated.wallet.demoBalanceMinor).toBe(START_BALANCE_MINOR - 100);
  });
});

describe("Wallet-Reducer — Zusatzeinsatz in laufender Runde (Verdoppeln, Teilen)", () => {
  const openInteractive = (stake = 100) => {
    const s = fresh();
    return walletReducer(s, {
      type: "START_ROUND",
      input: {
        roundId: "ri1",
        gameId: "g-classic-blackjack",
        stakeMinor: stake,
        minStakeMinor: 50,
        maxStakeMinor: 5000,
        returnMinor: 0,
        outcomeKey: "pending",
        seed: 7,
        interactive: true,
        maxReturnMinor: stake * 5,
      },
      ctx: ctx(),
    });
  };

  it("bucht den Zusatzeinsatz als eigene Transaktion und erhöht den Rahmen im selben Verhältnis", () => {
    let s = openInteractive(100);
    expect(s.pendingRound?.maxReturnMinor).toBe(500);
    s = walletReducer(s, { type: "RAISE_ROUND_STAKE", roundId: "ri1", additionalMinor: 100, ctx: ctx() });
    expect(s.transactions.filter((t) => t.type === "demo_bet")).toHaveLength(2);
    expect(s.wallet.demoBalanceMinor).toBe(START_BALANCE_MINOR - 200);
    expect(s.pendingRound?.stakeMinor).toBe(200);
    expect(s.pendingRound?.maxReturnMinor).toBe(1000);
    assertChain(s);
  });

  it("lehnt Erhöhungen ohne Deckung ab, ohne den Kontostand zu verändern", () => {
    let s = openInteractive(100);
    s = walletReducer(s, { type: "TOP_UP", amountMinor: 0, ctx: ctx() });
    const drained = { ...s, wallet: { ...s.wallet, demoBalanceMinor: 50, bonusBalanceMinor: 0 } };
    const rejected = walletReducer(drained, { type: "RAISE_ROUND_STAKE", roundId: "ri1", additionalMinor: 100, ctx: ctx() });
    expect(rejected.lastRejection?.code).toBe("INSUFFICIENT_FUNDS");
    expect(rejected.wallet.demoBalanceMinor).toBe(50);
  });

  it("begrenzt die Erhöhung auf das Vierfache des Grundeinsatzes (Teilen plus Verdoppeln)", () => {
    let s = openInteractive(100);
    s = walletReducer(s, { type: "RAISE_ROUND_STAKE", roundId: "ri1", additionalMinor: 300, ctx: ctx() });
    expect(s.pendingRound?.stakeMinor).toBe(400);
    const tooMuch = walletReducer(s, { type: "RAISE_ROUND_STAKE", roundId: "ri1", additionalMinor: 1, ctx: ctx() });
    expect(tooMuch.lastRejection?.code).toBe("RAISE_NOT_ALLOWED");
    expect(tooMuch.wallet.demoBalanceMinor).toBe(s.wallet.demoBalanceMinor);
  });

  it("lehnt Erhöhungen bei nicht-interaktiven Runden, Freirunden und ohne offene Runde ab", () => {
    const plain = walletReducer(fresh(), { type: "START_ROUND", input: round(), ctx: ctx() });
    expect(walletReducer(plain, { type: "RAISE_ROUND_STAKE", roundId: "r1", additionalMinor: 50, ctx: ctx() }).lastRejection?.code).toBe("RAISE_NOT_ALLOWED");
    expect(walletReducer(fresh(), { type: "RAISE_ROUND_STAKE", roundId: "nix", additionalMinor: 50, ctx: ctx() }).lastRejection?.code).toBe("NO_PENDING_ROUND");
    const s = openInteractive(100);
    for (const bad of [0, -50, 12.5]) {
      expect(walletReducer(s, { type: "RAISE_ROUND_STAKE", roundId: "ri1", additionalMinor: bad, ctx: ctx() }).lastRejection?.code).toBe("INVALID_STAKE");
    }
  });

  it("Abschluss nach Erhöhung: Kette bleibt korrekt, Guthaben nie negativ", () => {
    let s = openInteractive(100);
    s = walletReducer(s, { type: "RAISE_ROUND_STAKE", roundId: "ri1", additionalMinor: 100, ctx: ctx() });
    s = walletReducer(s, { type: "SETTLE_ROUND", roundId: "ri1", returnMinor: 400, ctx: ctx() });
    expect(s.wallet.demoBalanceMinor).toBe(START_BALANCE_MINOR - 200 + 400);
    expect(s.pendingRound).toBeNull();
    expect(s.wallet.roundInFlight).toBe(false);
    assertChain(s);
  });
});
