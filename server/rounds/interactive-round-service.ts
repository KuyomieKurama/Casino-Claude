import { randomInt } from "node:crypto";
import type { AppDatabase } from "@/server/db/types";
import { PgGameModeRepository } from "@/server/repositories/game-mode-repository";
import { consumeFreeSpin, creditReturn, debitForStake, findWallet, insertWalletIfMissing, type WalletRecord } from "@/server/repositories/wallet-repository";
import { insertLedgerEntry } from "@/server/repositories/ledger-repository";
import { findByIdempotencyKey, insertOpenRound, settleRound, type GameRoundRecord } from "@/server/repositories/game-round-repository";
import { findActionsForRound } from "@/server/repositories/game-round-action-repository";
import {
  checkFreeSpinAvailable,
  checkFundsAvailable,
  checkStakeRange,
  splitStakeAcrossBalances,
  type WalletRejectionCode,
} from "@/lib/wallet-policy";
import type { Wallet } from "@/types/wallet";
import { MAX_BALANCE_MINOR, START_BALANCE_MINOR } from "@/lib/constants";
import { createId, nowIso } from "@/lib/ids";
import { assertRgNotBlocked } from "@/server/rg/rg-guard";
// Ausnahme in eslint.config.mjs (server/**-Regel): reine, React-freie *-logic.ts-Importe — nur
// für die maxReturnMinor-Obergrenze je Engine (Auftrag §4, wie schon engine-resolvers.ts).
import { minesCountFromBetId, minesMaxReturnMinor } from "@/components/game/engine/arcade/mines-logic";
import { maxReturnFor } from "@/components/game/engine/blackjack/blackjack-logic";
import { MAX_MULTIPLIER } from "@/components/game/engine/videopoker/videopoker-logic";
import { isInteractiveEngineKey, isInteractiveRoundTranscript, type InteractiveEngineKey, type InteractiveEngineRunner, type InteractiveRoundTranscript } from "./interactive/types";
import { blackjackRunner, minesRunner, videoPokerRunner } from "./interactive/runners";

/**
 * Rundenstart der drei interaktiven Spielfamilien (Phase 3b, Auftrag §1/§2). Spiegelt den Ablauf
 * aus server/rounds/round-service.ts (nicht-interaktiv), unterscheidet sich aber in einem Punkt:
 * eine interaktive Runde ist nach dem Start meist noch NICHT abgeschlossen — sie bleibt `open`,
 * bis server/rounds/round-action-service.ts sie über Spieleraktionen zu Ende führt. Einzige
 * Ausnahme: ein natürlicher Blackjack direkt beim Austeilen (kein Spielzug nötig) wird SOFORT in
 * derselben Transaktion abgerechnet — genau wie eine nicht-interaktive Runde.
 */

export interface StartInteractiveRoundInput {
  userId: string;
  gameModeId: string;
  stakeMinor: number;
  idempotencyKey: string;
  useFreeSpin?: boolean;
  /** Nur Mines kennt eine Wettauswahl (Minenzahl, z. B. "m3"). */
  betId?: string;
}

export interface RoundWalletSnapshot {
  demoBalanceMinor: number;
  bonusBalanceMinor: number;
  freeSpins: number;
}

interface StartInteractiveDataBase {
  roundId: string;
  gameModeId: string;
  stakeMinor: number;
  betKey: string | null;
  usedFreeSpin: boolean;
  wallet: RoundWalletSnapshot;
}

export type StartInteractiveOpenData = StartInteractiveDataBase & {
  status: "open";
  maxReturnMinor: number;
  /** Nächste vom Client zu sendende Aktionsposition (immer 1 direkt nach dem Start). */
  nextSeq: number;
  state: unknown;
};

export type StartInteractiveSettledData = StartInteractiveDataBase & {
  status: "settled";
  returnMinor: number;
  /** returnMinor − stakeMinor (Ergebnis-Display bleibt netto, CLAUDE.md „Harte Invarianten"). */
  netMinor: number;
  outcomeKey: string;
  outcomeLabel: string;
  seed: number;
  state: unknown;
  /** Engine-spezifische Zusatzdaten für die Anzeige — siehe round-action-service.ts::ApplyActionSettledData.detail. */
  detail?: Record<string, unknown>;
};

export type StartInteractiveRoundData = StartInteractiveOpenData | StartInteractiveSettledData;
export type StartInteractiveRoundResult = { ok: true; data: StartInteractiveRoundData } | { ok: false; code: WalletRejectionCode };

function toWallet(record: WalletRecord): Wallet {
  return { demoBalanceMinor: record.demoBalanceMinor, bonusBalanceMinor: record.bonusBalanceMinor, freeSpins: record.freeSpins, roundInFlight: false };
}

function toSnapshot(record: WalletRecord): RoundWalletSnapshot {
  return { demoBalanceMinor: record.demoBalanceMinor, bonusBalanceMinor: record.bonusBalanceMinor, freeSpins: record.freeSpins };
}

function runnerFor(engine: InteractiveEngineKey): InteractiveEngineRunner<unknown> {
  switch (engine) {
    case "mines":
      return minesRunner as InteractiveEngineRunner<unknown>;
    case "blackjack":
      return blackjackRunner as InteractiveEngineRunner<unknown>;
    case "videopoker":
      return videoPokerRunner as InteractiveEngineRunner<unknown>;
  }
}

function maxReturnMinorFor(engine: InteractiveEngineKey, stakeMinor: number, betId: string | undefined): number {
  switch (engine) {
    case "mines":
      return minesMaxReturnMinor(stakeMinor, minesCountFromBetId(betId));
    case "blackjack":
      return maxReturnFor(stakeMinor);
    case "videopoker":
      return stakeMinor * MAX_MULTIPLIER;
  }
}

/** Baut die Antwort für eine bereits (in dieser Transaktion oder früher) abgeschlossene Runde. */
async function toOpenOrSettledData(
  db: AppDatabase,
  round: GameRoundRecord,
  wallet: WalletRecord,
  transcript: InteractiveRoundTranscript,
): Promise<StartInteractiveRoundData> {
  const runner = runnerFor(transcript.engine);
  const base: StartInteractiveDataBase = {
    roundId: round.id,
    gameModeId: round.gameModeId,
    stakeMinor: round.stakeMinor,
    betKey: round.betKey,
    usedFreeSpin: transcript.usedFreeSpin,
    wallet: toSnapshot(wallet),
  };
  if (round.status === "settled") {
    if (round.returnMinor === null || round.outcomeKey === null) {
      throw new Error(`Runde „${round.id}" ist als settled markiert, hat aber kein Ergebnis — Antwort kann nicht gebaut werden.`);
    }
    const state = runner.start({ seed: round.seed, stakeMinor: round.stakeMinor, betKey: round.betKey });
    const finalTranscript = isInteractiveRoundTranscript(round.transcript) ? round.transcript : transcript;
    const final = (finalTranscript as InteractiveRoundTranscript & { final?: { outcomeLabel?: unknown; detail?: Record<string, unknown> } }).final;
    const finalDetail = final?.detail ?? {};
    return {
      ...base,
      status: "settled",
      returnMinor: round.returnMinor,
      netMinor: round.returnMinor - (transcript.usedFreeSpin ? 0 : round.stakeMinor),
      outcomeKey: round.outcomeKey,
      outcomeLabel: typeof final?.outcomeLabel === "string" ? final.outcomeLabel : round.outcomeKey,
      seed: round.seed,
      state: runner.publicView(state, true, { seed: round.seed }),
      ...(Object.keys(finalDetail).length > 0 ? { detail: finalDetail } : {}),
    };
  }
  const actionCount = (await findActionsForRound(db, round.id)).length;
  const state = runner.start({ seed: round.seed, stakeMinor: round.stakeMinor, betKey: round.betKey });
  return {
    ...base,
    status: "open",
    maxReturnMinor: round.maxReturnMinor,
    nextSeq: actionCount + 1,
    state: runner.publicView(state, false, { seed: round.seed }),
  };
}

export async function startInteractiveRound(db: AppDatabase, input: StartInteractiveRoundInput): Promise<StartInteractiveRoundResult> {
  const gameModeRepo = new PgGameModeRepository(db);
  const mode = await gameModeRepo.findById(input.gameModeId);
  if (!mode || mode.status !== "active" || !isInteractiveEngineKey(mode.engineKey)) {
    return { ok: false, code: "INVALID_STAKE" };
  }
  const engine = mode.engineKey;

  const stakeCheck = checkStakeRange(input.stakeMinor, mode.minBetMinor, mode.maxBetMinor);
  if (!stakeCheck.ok) return { ok: false, code: stakeCheck.code };

  // Seed VOR der Transaktion, serverseitig, wie bei den nicht-interaktiven Familien
  // (round-service.ts) — reine Berechnung, kein DB-Zugriff, `crypto.randomInt` läuft nie im Browser.
  const seed = randomInt(0, 2 ** 31);

  return db.transaction(async (tx) => {
    const existing = await findByIdempotencyKey(tx, input.userId, input.idempotencyKey);
    if (existing) {
      if (!isInteractiveRoundTranscript(existing.transcript)) {
        throw new Error(`Runde „${existing.id}" (Idempotenzschlüssel) hat kein gültiges interaktives Transkript.`);
      }
      // ABSICHTLICH ohne erneute RG-Prüfung — dieselbe Begründung wie round-service.ts: nichts
      // wird hier neu gebucht.
      const currentWallet = await findWallet(tx, input.userId);
      if (!currentWallet) {
        throw new Error(`Wallet für Nutzer „${input.userId}" fehlt trotz bereits vorhandener Runde „${existing.id}" (Idempotenzschlüssel).`);
      }
      return { ok: true, data: await toOpenOrSettledData(tx, existing, currentWallet, existing.transcript) };
    }

    // Responsible-Gaming-Sperre (Auftrag „Server statt Client") — derselbe Platz wie in
    // round-service.ts: innerhalb der Transaktion, VOR der Wallet-Anlage/Startguthaben-Gutschrift
    // und vor jeder Buchung eines neuen Einsatzes.
    const rgCheck = await assertRgNotBlocked(tx, input.userId, nowIso());
    if (!rgCheck.ok) return { ok: false, code: rgCheck.code };

    const { walletRecord: freshWallet, created } = await insertWalletIfMissing(tx, input.userId, START_BALANCE_MINOR);
    if (created) {
      await insertLedgerEntry(tx, { userId: input.userId, seq: 1, type: "demo_credit", amountMinor: START_BALANCE_MINOR, balanceAfterMinor: START_BALANCE_MINOR });
    }

    let usedFreeSpin = false;
    let fromDemoMinor = 0;
    let fromBonusMinor = 0;
    let walletAfterDebit: WalletRecord;

    if (input.useFreeSpin) {
      const freeSpinCheck = checkFreeSpinAvailable(freshWallet.freeSpins);
      if (!freeSpinCheck.ok) return { ok: false, code: freeSpinCheck.code };
      const debit = await consumeFreeSpin(tx, input.userId);
      if (!debit.ok) return { ok: false, code: "NO_FREE_SPINS" };
      walletAfterDebit = debit.walletRecord;
      usedFreeSpin = true;
    } else {
      const fundsCheck = checkFundsAvailable(toWallet(freshWallet), input.stakeMinor);
      if (!fundsCheck.ok) return { ok: false, code: fundsCheck.code };
      const split = splitStakeAcrossBalances(toWallet(freshWallet), input.stakeMinor);
      fromDemoMinor = split.fromDemo;
      fromBonusMinor = split.fromBonus;
      const debit = await debitForStake(tx, input.userId, { fromBonusMinor, fromDemoMinor });
      if (!debit.ok) return { ok: false, code: "INSUFFICIENT_FUNDS" };
      walletAfterDebit = debit.walletRecord;
    }

    const roundId = createId("r");
    const transcript: InteractiveRoundTranscript = { engine, usedFreeSpin };
    const runner = runnerFor(engine);
    // `round.stakeMinor` bleibt IMMER der deklarierte Einsatzwert (auch bei Freirunde) — die
    // Engine braucht ihn für korrekte Auszahlungsgrößen (siehe Kommentar in round-action-
    // service.ts). Was tatsächlich vom Guthaben abging, steht in `transcript.usedFreeSpin`.
    const startState = runner.start({ seed, stakeMinor: input.stakeMinor, betKey: input.betId ?? null });
    const maxReturnMinor = maxReturnMinorFor(engine, input.stakeMinor, input.betId);

    const inserted = await insertOpenRound(tx, {
      id: roundId,
      userId: input.userId,
      gameModeId: mode.id,
      ...(input.betId ? { betKey: input.betId } : {}),
      stakeMinor: input.stakeMinor,
      seed,
      maxReturnMinor,
      idempotencyKey: input.idempotencyKey,
      transcript,
    });
    if (!inserted) {
      throw new Error(`Runde für Nutzer „${input.userId}" konnte nicht angelegt werden (Idempotenzschlüssel oder offene Runde kollidiert).`);
    }

    const availableAfterDebit = walletAfterDebit.demoBalanceMinor + walletAfterDebit.bonusBalanceMinor;
    if (usedFreeSpin) {
      await insertLedgerEntry(tx, {
        userId: input.userId,
        seq: walletAfterDebit.nextSeq - 1,
        type: "free_spin",
        amountMinor: 0,
        balanceAfterMinor: availableAfterDebit,
        gameModeId: mode.id,
        roundId,
      });
    } else {
      await insertLedgerEntry(tx, {
        userId: input.userId,
        seq: walletAfterDebit.nextSeq - 1,
        type: "demo_bet",
        amountMinor: -input.stakeMinor,
        balanceAfterMinor: availableAfterDebit,
        fromDemoMinor,
        fromBonusMinor,
        gameModeId: mode.id,
        roundId,
      });
    }

    if (!runner.isFinished(startState)) {
      return { ok: true, data: await toOpenOrSettledData(tx, inserted, walletAfterDebit, transcript) };
    }

    // Natürlicher Blackjack direkt beim Austeilen: kein Spielzug nötig, sofort abrechnen —
    // dieselbe Choreografie wie eine nicht-interaktive Runde (round-service.ts).
    const settlement = runner.settle(startState, input.stakeMinor);
    if (!Number.isInteger(settlement.returnMinor) || settlement.returnMinor < 0) {
      throw new Error(`Engine „${engine}" (${mode.id}) hat beim Rundenstart ein ungültiges Ergebnis geliefert: ${settlement.returnMinor}`);
    }
    const walletAfterCredit = await creditReturn(tx, input.userId, settlement.returnMinor, MAX_BALANCE_MINOR);
    await insertLedgerEntry(tx, {
      userId: input.userId,
      seq: walletAfterCredit.nextSeq - 1,
      type: "demo_win",
      amountMinor: settlement.returnMinor,
      balanceAfterMinor: walletAfterCredit.demoBalanceMinor + walletAfterCredit.bonusBalanceMinor,
      gameModeId: mode.id,
      roundId,
    });
    const settledTranscript = { ...transcript, final: { outcomeLabel: settlement.outcomeLabel, detail: settlement.detail } };
    const settled = await settleRound(tx, roundId, { outcomeKey: settlement.outcomeKey, returnMinor: settlement.returnMinor, transcript: settledTranscript });
    return { ok: true, data: await toOpenOrSettledData(tx, settled, walletAfterCredit, transcript) };
  });
}
