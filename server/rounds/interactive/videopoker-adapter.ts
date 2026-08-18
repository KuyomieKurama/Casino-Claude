import type { WalletRejectionCode } from "@/lib/wallet-policy";
// Ausnahme in eslint.config.mjs (server/**-Regel, dieselbe wie engine-resolvers.ts): reiner,
// React-freier Import der UNVERÄNDERTEN Video-Poker-Fachlogik (Auftrag §4).
import {
  HAND_SIZE,
  dealHand,
  finishVideoPokerRound,
  labelFor,
  multiplierFor,
  type HandCategory,
  type PokerCard,
} from "@/components/game/engine/videopoker/videopoker-logic";

/**
 * Serverseitiger Video-Poker-Adapter (Phase 3b). Die Nachziehkarten (`Deal.draw`) entstehen wie
 * bisher rein aus dem Seed — anders als bei Mines/Blackjack werden sie hier nicht einmal
 * ZWISCHENGESPEICHERT, sondern beim Tausch erneut aus `dealHand(seed)` berechnet
 * (`finishVideoPokerRound`, unverändert). Der Adapterzustand kennt sie deshalb überhaupt nie —
 * es gibt also nichts, was `videoPokerPublicView()` versehentlich mitschicken könnte.
 */

export type VideoPokerRoundState = {
  hand: PokerCard[];
  finished: boolean;
  finalHand: PokerCard[] | null;
  category: HandCategory | null;
};

export type VideoPokerActionCheck = { ok: true } | { ok: false; code: WalletRejectionCode };

export function startVideoPokerRoundState(ctx: { seed: number; stakeMinor: number; betKey: string | null }): VideoPokerRoundState {
  const deal = dealHand(ctx.seed);
  return { hand: deal.hand, finished: false, finalHand: null, category: null };
}

export function isVideoPokerRoundFinished(state: VideoPokerRoundState): boolean {
  return state.finished;
}

function isHoldsArray(value: unknown): value is boolean[] {
  return Array.isArray(value) && value.length === HAND_SIZE && value.every((v) => typeof v === "boolean");
}

/** Einzige Aktion "draw": Nutzlast ist die Halteauswahl, genau HAND_SIZE boolesche Werte. */
export function parseVideoPokerPayload(action: string, payload: unknown): { ok: true; value: { holds: boolean[] } } | { ok: false } {
  if (action !== "draw") return { ok: false };
  if (typeof payload !== "object" || payload === null) return { ok: false };
  const holds = (payload as Record<string, unknown>).holds;
  return isHoldsArray(holds) ? { ok: true, value: { holds } } : { ok: false };
}

/** Genau ein Tausch pro Runde (Auftrag: „ein Tausch beliebig vieler Karten") — danach ist "draw" nicht mehr zulässig. */
export function checkVideoPokerAction(state: VideoPokerRoundState, action: string, payload: unknown): VideoPokerActionCheck {
  if (isVideoPokerRoundFinished(state)) return { ok: false, code: "INVALID_STAKE" };
  const parsed = parseVideoPokerPayload(action, payload);
  if (!parsed.ok) return { ok: false, code: "INVALID_STAKE" };
  return { ok: true };
}

/** Video Poker kennt keinen Zusatzeinsatz (anders als Blackjack). */
export function additionalStakeForVideoPokerAction(): number {
  return 0;
}

/** Wendet die geprüfte "draw"-Aktion an — ruft dieselbe, unveränderte finishVideoPokerRound()-Funktion wie bisher der Client. */
export function applyVideoPokerAction(
  state: VideoPokerRoundState,
  action: string,
  payload: unknown,
  ctx: { seed: number; stakeMinor: number },
): VideoPokerRoundState {
  const parsed = parseVideoPokerPayload(action, payload);
  if (!parsed.ok) throw new Error(`Video Poker: unbekannte Aktion „${action}" oder ungültige Nutzlast.`);
  const result = finishVideoPokerRound(ctx.seed, parsed.value.holds, ctx.stakeMinor);
  return { ...state, finished: true, finalHand: result.finalHand, category: result.category };
}

export type VideoPokerSettlement = { returnMinor: number; outcomeKey: string; outcomeLabel: string; detail: Record<string, unknown> };

/** Endabrechnung — nur aufrufbar, wenn isVideoPokerRoundFinished(state) === true. */
export function settleVideoPokerRound(state: VideoPokerRoundState, stakeMinor: number): VideoPokerSettlement {
  if (!state.finished || state.category === null || state.finalHand === null) {
    throw new Error("Video Poker: Abrechnung vor dem Tausch angefordert.");
  }
  // multiplierFor()/labelFor() sind reine Tabellen-Nachschläge (videopoker-logic.ts) — derselbe
  // Multiplikator, den finishVideoPokerRound() in applyVideoPokerAction() bereits verwendet hat.
  const multiplier = multiplierFor(state.category);
  return {
    returnMinor: stakeMinor * multiplier,
    outcomeKey: state.category,
    outcomeLabel: labelFor(state.category),
    detail: { category: state.category, multiplier },
  };
}

export type VideoPokerPublicView = {
  hand: PokerCard[];
  finalHand: PokerCard[] | null;
  category: HandCategory | null;
};

/**
 * Sichtbarkeitsgrenze (Auftrag §3): niemals das ungezogene Restdeck. `hand` (die eigenen fünf
 * Startkarten) darf jederzeit gezeigt werden — das sind die Karten der spielenden Person selbst,
 * keine geheime Information. `finalHand`/`category` sind vor dem Tausch immer `null`, unabhängig
 * von `finished` — der Parameter steht nur wegen der gemeinsamen `InteractiveEngineRunner`-
 * Schnittstelle (types.ts) hier, Video Poker braucht ihn nicht (state trägt bereits alles Nötige).
 */
export function videoPokerPublicView(state: VideoPokerRoundState, finished: boolean): VideoPokerPublicView {
  void finished;
  return { hand: state.hand, finalHand: state.finalHand, category: state.category };
}
