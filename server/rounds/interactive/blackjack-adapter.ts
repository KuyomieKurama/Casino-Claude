import type { WalletRejectionCode } from "@/lib/wallet-policy";
// Ausnahme in eslint.config.mjs (server/**-Regel, dieselbe wie engine-resolvers.ts): reiner,
// React-freier Import der UNVERÄNDERTEN Blackjack-Fachlogik (Auftrag §4). `applyAction` und
// `roundSettlement` werden 1:1 weiterverwendet — dieser Adapter fügt nur die Zusatzeinsatz-
// Berechnung und die Sichtbarkeitsgrenze der verdeckten Dealerkarte für den Server hinzu.
import {
  applyAction as applyBlackjackLogicAction,
  availableActions,
  beginRound,
  roundSettlement,
  type BlackjackAction,
  type Card,
  type RoundState,
} from "@/components/game/engine/blackjack/blackjack-logic";

export type { RoundState as BlackjackRoundState };

export type BlackjackActionCheck = { ok: true } | { ok: false; code: WalletRejectionCode };

/** Zustand direkt nach dem Austeilen — kann bei natürlichem Blackjack bereits phase "done" sein. */
export function startBlackjackRoundState(ctx: { seed: number; stakeMinor: number; betKey: string | null }): RoundState {
  return beginRound(ctx.seed, ctx.stakeMinor);
}

export function isBlackjackRoundFinished(state: RoundState): boolean {
  return state.phase === "done";
}

function isBlackjackAction(value: string): value is BlackjackAction {
  return value === "hit" || value === "stand" || value === "double" || value === "split";
}

/** Blackjack-Aktionen kennen keine Nutzlast — anders als Mines' "reveal" mit Feldindex. */
export function parseBlackjackPayload(action: string, payload: unknown): { ok: true; value: Record<string, never> } | { ok: false } {
  if (!isBlackjackAction(action)) return { ok: false };
  const isEmpty = payload === undefined || (typeof payload === "object" && payload !== null && Object.keys(payload).length === 0);
  return isEmpty ? { ok: true, value: {} } : { ok: false };
}

/**
 * Prüft eine Aktion gegen den abgeleiteten Zustand. `availableActions()` aus blackjack-logic.ts
 * kennt bereits alle Fachregeln (nicht nach "done", "double" nur mit zwei Karten, "split" nur bei
 * gleichem Rang und höchstens einmal) — hier kommt nur die Nutzlastprüfung dazu.
 */
export function checkBlackjackAction(state: RoundState, action: string, payload: unknown): BlackjackActionCheck {
  const parsed = parseBlackjackPayload(action, payload);
  if (!parsed.ok) return { ok: false, code: "INVALID_STAKE" };
  if (!availableActions(state).includes(action as BlackjackAction)) return { ok: false, code: "INVALID_STAKE" };
  return { ok: true };
}

/**
 * Zusatzeinsatz, den diese Aktion VOR ihrer Anwendung kostet — exakt wie bisher clientseitig in
 * BlackjackGame.tsx::act() berechnet (Auftrag §2: „Zusatzeinsätze … als eigene Ledger-Buchung").
 */
export function additionalStakeForBlackjackAction(state: RoundState, action: string): number {
  if (!isBlackjackAction(action)) return 0;
  const hand = state.hands[state.activeHand];
  if (action === "double") return hand?.betMinor ?? 0;
  if (action === "split") return state.baseBetMinor;
  return 0;
}

/**
 * Wendet eine bereits über checkBlackjackAction() geprüfte Aktion an — direkter Aufruf der
 * unveränderten Engine-Logik. `payload` bleibt ungenutzt (Blackjack-Aktionen kennen keine
 * Nutzlast, siehe parseBlackjackPayload) — der Parameter steht trotzdem in der Signatur, damit
 * sie zur gemeinsamen `InteractiveEngineRunner`-Schnittstelle (types.ts) passt.
 */
export function applyBlackjackAction(state: RoundState, action: string, payload: unknown): RoundState {
  void payload;
  if (!isBlackjackAction(action)) throw new Error(`Blackjack: unbekannte Aktion „${action}".`);
  return applyBlackjackLogicAction(state, action);
}

export type BlackjackSettlement = { returnMinor: number; outcomeKey: string; outcomeLabel: string; detail: Record<string, unknown> };

/** Endabrechnung — nur aufrufbar, wenn isBlackjackRoundFinished(state) === true. */
export function settleBlackjackRound(state: RoundState): BlackjackSettlement {
  const s = roundSettlement(state);
  return {
    returnMinor: s.returnMinor,
    outcomeKey: s.outcomeKey,
    outcomeLabel: s.outcomeLabel,
    detail: {
      totalBetMinor: s.totalBetMinor,
      extraBetMinor: s.extraBetMinor,
      grossReturnMinor: s.grossReturnMinor,
      hands: s.results.map((h) => h.kind),
    },
  };
}

type PublicHand = { cards: Card[]; betMinor: number; doubled: boolean; fromSplit: boolean; splitAces: boolean; done: boolean };
export type BlackjackPublicView = {
  dealer: Card[];
  hands: PublicHand[];
  activeHand: number;
  phase: RoundState["phase"];
  baseBetMinor: number;
};

/**
 * Sichtbarkeitsgrenze (Auftrag §3): die verdeckte Dealerkarte wird erst gezeigt, wenn die Runde
 * fertig ist (`finished === true`, entspricht `state.phase === "done"`) — vorher enthält
 * `dealer` nur die offene erste Karte. `shoe`, `drawIndex` und `seed` verlassen den Adapter nie:
 * sie würden künftige Ziehkarten verraten, auch wenn die aktuelle Regel sie nicht explizit nennt.
 */
export function blackjackPublicView(state: RoundState, finished: boolean): BlackjackPublicView {
  return {
    dealer: finished ? state.dealer : state.dealer.slice(0, 1),
    hands: state.hands,
    activeHand: state.activeHand,
    phase: state.phase,
    baseBetMinor: state.baseBetMinor,
  };
}
