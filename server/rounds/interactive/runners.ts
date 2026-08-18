import type { InteractiveEngineRunner } from "./types";
import {
  additionalStakeForBlackjackAction,
  applyBlackjackAction,
  blackjackPublicView,
  checkBlackjackAction,
  isBlackjackRoundFinished,
  settleBlackjackRound,
  startBlackjackRoundState,
  type BlackjackRoundState,
} from "./blackjack-adapter";
import {
  additionalStakeForMinesAction,
  applyMinesAction,
  checkMinesAction,
  isMinesRoundFinished,
  minesPublicView,
  settleMinesRound,
  startMinesRoundState,
  type MinesRoundState,
} from "./mines-adapter";
import {
  additionalStakeForVideoPokerAction,
  applyVideoPokerAction,
  checkVideoPokerAction,
  isVideoPokerRoundFinished,
  settleVideoPokerRound,
  startVideoPokerRoundState,
  videoPokerPublicView,
  type VideoPokerRoundState,
} from "./videopoker-adapter";

/**
 * Verdrahtet jeden Adapter EINMAL auf die gemeinsame `InteractiveEngineRunner`-Schnittstelle
 * (types.ts) — sowohl server/rounds/interactive-round-service.ts (Rundenstart) als auch
 * server/rounds/round-action-service.ts (Spieleraktionen) verwenden dieselben drei Objekte,
 * statt die Verdrahtung zweimal zu wiederholen.
 */

export const minesRunner: InteractiveEngineRunner<MinesRoundState> = {
  start: startMinesRoundState,
  isFinished: isMinesRoundFinished,
  check: checkMinesAction,
  additionalStake: additionalStakeForMinesAction,
  apply: (state, action, payload, ctx) => applyMinesAction(state, action, payload, { seed: ctx.seed }),
  settle: settleMinesRound,
  // Zwei Overloads statt eines einzelnen `boolean`-Parameters (siehe mines-adapter.ts) — hier
  // wieder in zwei Zweige aufgelöst, weil `finished` an dieser Stelle nur als `boolean` ankommt.
  publicView: (state, finished, ctx) => (finished ? minesPublicView(state, true, { seed: ctx.seed }) : minesPublicView(state, false, { seed: ctx.seed })),
};

export const blackjackRunner: InteractiveEngineRunner<BlackjackRoundState> = {
  start: startBlackjackRoundState,
  isFinished: isBlackjackRoundFinished,
  check: checkBlackjackAction,
  additionalStake: (state, action) => additionalStakeForBlackjackAction(state, action),
  apply: (state, action, payload) => applyBlackjackAction(state, action, payload),
  settle: (state) => settleBlackjackRound(state),
  publicView: (state, finished) => blackjackPublicView(state, finished),
};

export const videoPokerRunner: InteractiveEngineRunner<VideoPokerRoundState> = {
  start: startVideoPokerRoundState,
  isFinished: isVideoPokerRoundFinished,
  check: checkVideoPokerAction,
  additionalStake: additionalStakeForVideoPokerAction,
  apply: applyVideoPokerAction,
  settle: settleVideoPokerRound,
  publicView: (state, finished) => videoPokerPublicView(state, finished),
};
