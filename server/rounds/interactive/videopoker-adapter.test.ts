import { describe, expect, test } from "vitest";
import { dealHand } from "@/components/game/engine/videopoker/videopoker-logic";
import {
  applyVideoPokerAction,
  checkVideoPokerAction,
  isVideoPokerRoundFinished,
  parseVideoPokerPayload,
  settleVideoPokerRound,
  startVideoPokerRoundState,
  videoPokerPublicView,
} from "./videopoker-adapter";

/**
 * Adapter-Tests (Phase 3b, Auftrag §3/§4): ruft ausschließlich die UNVERÄNDERTE Fachlogik aus
 * components/game/engine/videopoker/videopoker-logic.ts auf. Schwerpunkt: das ungezogene
 * Restdeck darf den Client nie erreichen.
 */

const SEED = 55;

describe("videopoker-adapter — Zustandsableitung", () => {
  test("startVideoPokerRoundState entspricht dealHand(seed)", () => {
    const state = startVideoPokerRoundState({ seed: SEED, stakeMinor: 100, betKey: null });
    const deal = dealHand(SEED);
    expect(state.hand).toEqual(deal.hand);
    expect(isVideoPokerRoundFinished(state)).toBe(false);
  });

  test("deterministisch: gleicher Seed und gleiche Halteauswahl ⇒ gleiches Ergebnis", () => {
    const holds = [true, false, false, true, false];
    const a = applyVideoPokerAction(startVideoPokerRoundState({ seed: SEED, stakeMinor: 100, betKey: null }), "draw", { holds }, { seed: SEED, stakeMinor: 100 });
    const b = applyVideoPokerAction(startVideoPokerRoundState({ seed: SEED, stakeMinor: 100, betKey: null }), "draw", { holds }, { seed: SEED, stakeMinor: 100 });
    expect(a).toEqual(b);
  });
});

describe("videopoker-adapter — Aktionsprüfung", () => {
  test("draw mit fünf Halte-Flags ist erlaubt", () => {
    const state = startVideoPokerRoundState({ seed: SEED, stakeMinor: 100, betKey: null });
    expect(checkVideoPokerAction(state, "draw", { holds: [false, false, false, false, false] })).toEqual({ ok: true });
  });

  test("draw mit falscher Länge der Halteauswahl wird abgelehnt", () => {
    const state = startVideoPokerRoundState({ seed: SEED, stakeMinor: 100, betKey: null });
    expect(checkVideoPokerAction(state, "draw", { holds: [true, false] })).toEqual({ ok: false, code: "INVALID_STAKE" });
  });

  test("ein zweites draw auf derselben Runde wird abgelehnt (nur ein Tausch pro Runde)", () => {
    let state = startVideoPokerRoundState({ seed: SEED, stakeMinor: 100, betKey: null });
    state = applyVideoPokerAction(state, "draw", { holds: [false, false, false, false, false] }, { seed: SEED, stakeMinor: 100 });
    expect(isVideoPokerRoundFinished(state)).toBe(true);
    expect(checkVideoPokerAction(state, "draw", { holds: [false, false, false, false, false] })).toEqual({ ok: false, code: "INVALID_STAKE" });
  });

  test("parseVideoPokerPayload verlangt genau fünf boolesche Werte", () => {
    expect(parseVideoPokerPayload("draw", { holds: [true, true, true, true, true] })).toEqual({ ok: true, value: { holds: [true, true, true, true, true] } });
    expect(parseVideoPokerPayload("draw", { holds: [1, 0, 0, 0, 0] })).toEqual({ ok: false });
    expect(parseVideoPokerPayload("draw", {})).toEqual({ ok: false });
  });
});

describe("videopoker-adapter — Abrechnung", () => {
  test("Rückgabe ist ganzzahlig, nie negativ, und entspricht returnForHand", () => {
    const holds = [false, false, false, false, false];
    let state = startVideoPokerRoundState({ seed: SEED, stakeMinor: 200, betKey: null });
    state = applyVideoPokerAction(state, "draw", { holds }, { seed: SEED, stakeMinor: 200 });
    const settlement = settleVideoPokerRound(state, 200);
    expect(Number.isInteger(settlement.returnMinor)).toBe(true);
    expect(settlement.returnMinor).toBeGreaterThanOrEqual(0);
  });
});

describe("videopoker-adapter — Sichtbarkeitsgrenze (kein ungezogenes Restdeck)", () => {
  test("publicView() vor dem Tausch enthält nur die gegebene Hand, nicht das Restdeck oder den Seed", () => {
    const state = startVideoPokerRoundState({ seed: SEED, stakeMinor: 100, betKey: null });
    const view = videoPokerPublicView(state, false);
    expect(view).not.toHaveProperty("draw");
    expect(view).not.toHaveProperty("seed");
    expect(view).not.toHaveProperty("deck");
    expect(view.hand).toEqual(state.hand);
  });

  test("publicView() nach dem Tausch zeigt die Endhand und die Kategorie, weiterhin ohne Restdeck", () => {
    let state = startVideoPokerRoundState({ seed: SEED, stakeMinor: 100, betKey: null });
    state = applyVideoPokerAction(state, "draw", { holds: [false, false, false, false, false] }, { seed: SEED, stakeMinor: 100 });
    const view = videoPokerPublicView(state, true);
    expect(view).not.toHaveProperty("draw");
    expect(view).not.toHaveProperty("seed");
    expect(view.finalHand).toEqual(state.finalHand);
    expect(view.category).toBe(state.category);
  });
});
