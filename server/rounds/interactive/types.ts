import type { WalletRejectionCode } from "@/lib/wallet-policy";
import type { EngineKey } from "@/server/db/enums";

/**
 * Gemeinsame Schnittstelle der drei interaktiven Adapter (Mines, Blackjack, Video Poker).
 * Jeder Adapter bleibt in seiner eigenen Datei vollständig typisiert (z. B. `MinesRoundState`
 * statt `unknown`, siehe *-adapter.test.ts) — dieser Runner-Typ existiert ausschließlich, damit
 * server/rounds/round-action-service.ts und server/rounds/interactive-round-service.ts EINE
 * Ablaufsteuerung für alle drei schreiben können, statt sie dreimal fast identisch zu duplizieren.
 */
export interface InteractiveEngineRunner<TState> {
  start(ctx: { seed: number; stakeMinor: number; betKey: string | null }): TState;
  isFinished(state: TState): boolean;
  check(state: TState, action: string, payload: unknown): { ok: true } | { ok: false; code: WalletRejectionCode };
  /** Zusatzeinsatz, den diese Aktion VOR ihrer Anwendung kostet (0, wenn keiner — nur Blackjack kennt das). */
  additionalStake(state: TState, action: string, payload: unknown): number;
  apply(state: TState, action: string, payload: unknown, ctx: { seed: number; stakeMinor: number }): TState;
  settle(state: TState, stakeMinor: number): { returnMinor: number; outcomeKey: string; outcomeLabel: string; detail: Record<string, unknown> };
  /** Sichtbarkeitsgrenze (Auftrag §3) — die einzige Stelle, die entscheidet, was der Client sehen darf. */
  publicView(state: TState, finished: boolean, ctx: { seed: number }): unknown;
}

export const INTERACTIVE_ENGINE_KEYS = ["mines", "blackjack", "videopoker"] as const;
export type InteractiveEngineKey = (typeof INTERACTIVE_ENGINE_KEYS)[number];

export function isInteractiveEngineKey(key: EngineKey): key is InteractiveEngineKey {
  return (INTERACTIVE_ENGINE_KEYS as readonly string[]).includes(key);
}

/**
 * Transkript einer interaktiven Runde (`game_round.transcript`, Auftrag §1). Anders als bei den
 * nicht-interaktiven Familien (round-service.ts::RoundTranscript) steht hier VOR Rundenende noch
 * kein Ergebnis — der Zustand entsteht ausschließlich aus `engine` (welcher Adapter?) und dem
 * Aktionsprotokoll (`game_round_action`), niemals aus einem hier gespeicherten Zwischenstand.
 */
export interface InteractiveRoundTranscript {
  engine: InteractiveEngineKey;
  usedFreeSpin: boolean;
}

export function isInteractiveRoundTranscript(value: unknown): value is InteractiveRoundTranscript {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.engine === "string" && (INTERACTIVE_ENGINE_KEYS as readonly string[]).includes(v.engine) && typeof v.usedFreeSpin === "boolean";
}
