import { describe, expect, test } from "vitest";
import { createShoe, handValue, isBlackjack } from "@/components/game/engine/blackjack/blackjack-logic";
import {
  additionalStakeForBlackjackAction,
  applyBlackjackAction,
  blackjackPublicView,
  checkBlackjackAction,
  isBlackjackRoundFinished,
  parseBlackjackPayload,
  settleBlackjackRound,
  startBlackjackRoundState,
} from "./blackjack-adapter";

/**
 * Adapter-Tests (Phase 3b, Auftrag §3/§4): ruft ausschließlich die UNVERÄNDERTE Fachlogik aus
 * components/game/engine/blackjack/blackjack-logic.ts auf. Schwerpunkt: Sichtbarkeitsgrenze der
 * verdeckten Dealerkarte und Ablehnung unzulässiger Aktionen.
 */

/** Seed, unter dem die erste Runde KEIN natürlicher Blackjack ist (für "normalen" Rundenverlauf). */
function findNonNaturalSeed(): number {
  for (let seed = 1; seed < 1000; seed++) {
    const state = startBlackjackRoundState({ seed, stakeMinor: 100, betKey: null });
    if (!isBlackjackRoundFinished(state)) return seed;
  }
  throw new Error("Kein passender Seed gefunden.");
}

const SEED = findNonNaturalSeed();

describe("blackjack-adapter — Zustandsableitung", () => {
  test("startBlackjackRoundState entspricht beginRound(seed, stakeMinor) aus blackjack-logic.ts", () => {
    const state = startBlackjackRoundState({ seed: SEED, stakeMinor: 100, betKey: null });
    expect(state.hands).toHaveLength(1);
    expect(state.hands[0]?.cards).toHaveLength(2);
    expect(state.dealer).toHaveLength(2);
    expect(state.phase).toBe("player");
  });

  test("deterministisch: gleicher Seed und gleiche Aktionsfolge ⇒ gleicher Endzustand", () => {
    const a = applyBlackjackAction(startBlackjackRoundState({ seed: SEED, stakeMinor: 100, betKey: null }), "hit", {});
    const b = applyBlackjackAction(startBlackjackRoundState({ seed: SEED, stakeMinor: 100, betKey: null }), "hit", {});
    expect(a).toEqual(b);
  });
});

describe("blackjack-adapter — Aktionsprüfung", () => {
  test("hit und stand sind zu Rundenbeginn erlaubt", () => {
    const state = startBlackjackRoundState({ seed: SEED, stakeMinor: 100, betKey: null });
    expect(checkBlackjackAction(state, "hit", {})).toEqual({ ok: true });
    expect(checkBlackjackAction(state, "stand", {})).toEqual({ ok: true });
  });

  test("Karte ziehen nach stand wird abgelehnt", () => {
    let state = startBlackjackRoundState({ seed: SEED, stakeMinor: 100, betKey: null });
    state = applyBlackjackAction(state, "stand", {});
    expect(isBlackjackRoundFinished(state)).toBe(true);
    expect(checkBlackjackAction(state, "hit", {})).toEqual({ ok: false, code: "INVALID_STAKE" });
  });

  test("double ist nach dem ersten hit nicht mehr erlaubt (mehr als zwei Karten)", () => {
    let state = startBlackjackRoundState({ seed: SEED, stakeMinor: 100, betKey: null });
    state = applyBlackjackAction(state, "hit", {});
    if (isBlackjackRoundFinished(state)) return; // Falls der Zufallsseed bereits überkauft — kein relevanter Fall hier.
    expect(checkBlackjackAction(state, "double", {})).toEqual({ ok: false, code: "INVALID_STAKE" });
  });

  test("jede Aktion auf einer abgeschlossenen Runde wird abgelehnt", () => {
    let state = startBlackjackRoundState({ seed: SEED, stakeMinor: 100, betKey: null });
    state = applyBlackjackAction(state, "stand", {});
    expect(checkBlackjackAction(state, "stand", {})).toEqual({ ok: false, code: "INVALID_STAKE" });
  });

  test("parseBlackjackPayload verlangt eine leere Nutzlast (Blackjack-Aktionen kennen keine Parameter)", () => {
    expect(parseBlackjackPayload("hit", {})).toEqual({ ok: true, value: {} });
    expect(parseBlackjackPayload("hit", undefined)).toEqual({ ok: true, value: {} });
    expect(parseBlackjackPayload("hit", { amountMinor: 999_999 })).toEqual({ ok: false });
  });
});

describe("blackjack-adapter — Zusatzeinsatz", () => {
  test("double kostet genau den aktuellen Handeinsatz", () => {
    const state = startBlackjackRoundState({ seed: SEED, stakeMinor: 250, betKey: null });
    expect(additionalStakeForBlackjackAction(state, "double")).toBe(250);
  });

  test("split kostet genau den Grundeinsatz", () => {
    const state = startBlackjackRoundState({ seed: SEED, stakeMinor: 250, betKey: null });
    expect(additionalStakeForBlackjackAction(state, "split")).toBe(250);
  });

  test("hit und stand kosten keinen Zusatzeinsatz", () => {
    const state = startBlackjackRoundState({ seed: SEED, stakeMinor: 250, betKey: null });
    expect(additionalStakeForBlackjackAction(state, "hit")).toBe(0);
    expect(additionalStakeForBlackjackAction(state, "stand")).toBe(0);
  });
});

describe("blackjack-adapter — Abrechnung", () => {
  test("settleBlackjackRound entspricht roundSettlement(state) aus blackjack-logic.ts", () => {
    let state = startBlackjackRoundState({ seed: SEED, stakeMinor: 100, betKey: null });
    state = applyBlackjackAction(state, "stand", {});
    expect(isBlackjackRoundFinished(state)).toBe(true);
    const settlement = settleBlackjackRound(state);
    expect(Number.isInteger(settlement.returnMinor)).toBe(true);
    expect(settlement.returnMinor).toBeGreaterThanOrEqual(0);
    expect(typeof settlement.outcomeKey).toBe("string");
  });
});

describe("blackjack-adapter — Sichtbarkeitsgrenze (verdeckte Dealerkarte)", () => {
  test("publicView() zeigt während der Runde nur die offene Dealerkarte, nicht die verdeckte", () => {
    const state = startBlackjackRoundState({ seed: SEED, stakeMinor: 100, betKey: null });
    const view = blackjackPublicView(state, false);
    expect(view.dealer).toHaveLength(1);
    expect(view.dealer[0]).toEqual(state.dealer[0]);
  });

  test("publicView() enthält niemals den Kartenschlitten oder den Ziehindex", () => {
    const state = startBlackjackRoundState({ seed: SEED, stakeMinor: 100, betKey: null });
    const view = blackjackPublicView(state, false);
    expect(view).not.toHaveProperty("shoe");
    expect(view).not.toHaveProperty("drawIndex");
    expect(view).not.toHaveProperty("seed");
  });

  test("nach Rundenende zeigt publicView() die vollständige Dealerhand", () => {
    let state = startBlackjackRoundState({ seed: SEED, stakeMinor: 100, betKey: null });
    state = applyBlackjackAction(state, "stand", {});
    const view = blackjackPublicView(state, true);
    expect(view.dealer).toEqual(state.dealer);
    expect(view.dealer.length).toBeGreaterThanOrEqual(2);
  });

  test("Kontrolle: der volle Kartenschlitten enthält tatsächlich mehr als die verdeckte Karte (sonst wäre der Test wirkungslos)", () => {
    const shoe = createShoe(SEED);
    expect(shoe.length).toBeGreaterThan(4);
  });
});

describe("blackjack-adapter — natürlicher Blackjack beim Austeilen", () => {
  test("ist die Runde direkt nach dem Start bereits fertig, meldet isBlackjackRoundFinished(true) — keine Aktion nötig", () => {
    // Seed suchen, der direkt einen natürlichen Blackjack austeilt.
    let naturalSeed: number | null = null;
    for (let seed = 1; seed < 2000; seed++) {
      const state = startBlackjackRoundState({ seed, stakeMinor: 100, betKey: null });
      if (isBlackjackRoundFinished(state)) {
        naturalSeed = seed;
        break;
      }
    }
    expect(naturalSeed).not.toBeNull();
    if (naturalSeed === null) return;
    const state = startBlackjackRoundState({ seed: naturalSeed, stakeMinor: 100, betKey: null });
    expect(isBlackjack(state.hands[0]!.cards) || isBlackjack(state.dealer)).toBe(true);
    expect(handValue(state.dealer).total).toBeLessThanOrEqual(21);
    const settlement = settleBlackjackRound(state);
    expect(settlement.returnMinor).toBeGreaterThanOrEqual(0);
  });
});
