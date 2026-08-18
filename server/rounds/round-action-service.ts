import type { AppDatabase } from "@/server/db/types";
import type { GameRoundActionName } from "@/server/db/enums";
import { findRoundForUpdate, settleRound, type GameRoundRecord } from "@/server/repositories/game-round-repository";
import { findActionsForRound, insertRoundAction, type GameRoundActionRecord } from "@/server/repositories/game-round-action-repository";
import { creditReturn, debitForStake, findWallet, type WalletRecord } from "@/server/repositories/wallet-repository";
import { insertLedgerEntry } from "@/server/repositories/ledger-repository";
import { checkRaiseAllowed, splitStakeAcrossBalances, type WalletRejectionCode } from "@/lib/wallet-policy";
import type { Wallet } from "@/types/wallet";
import { MAX_BALANCE_MINOR } from "@/lib/constants";
import { createId } from "@/lib/ids";
import type { InteractiveEngineRunner, InteractiveRoundTranscript } from "./interactive/types";
import { isInteractiveRoundTranscript } from "./interactive/types";
import { blackjackRunner, minesRunner, videoPokerRunner } from "./interactive/runners";

/**
 * Aktions-Service interaktiver Runden (Phase 3b, Auftrag §1/§2). Zuständig für Blackjack, Mines
 * und Video Poker gleichermaßen — die Auflösung selbst ruft ausschließlich die drei Adapter unter
 * `server/rounds/interactive/*-adapter.ts` auf, die wiederum die UNVERÄNDERTE Fachlogik unter
 * `components/game/engine/**​/*-logic.ts` verwenden (Auftrag §4).
 *
 * Nebenläufigkeit (Auftrag §8): `findRoundForUpdate` sperrt die Zeile in `game_round` für die
 * Dauer der Transaktion (`SELECT … FOR UPDATE`). Zwei gleichzeitige Aktionen auf DERSELBEN Runde
 * serialisieren sich dadurch an dieser Anweisung — die zweite sieht garantiert das vollständige,
 * bereits committete Aktionsprotokoll der ersten, bevor sie ihre eigene `seq`-Prüfung vornimmt.
 * Der Beweis dafür läuft, wie in Phase 3a, gegen ECHTES PostgreSQL (scripts/concurrency-check.ts),
 * weil PGlite Transaktionen intern serialisiert und einen echten Wettlauf nicht zeigen kann.
 *
 * Idempotenz (Auftrag §1): `UNIQUE (round_id, seq)` auf `game_round_action`. Der Client gibt die
 * Position seiner Aktion innerhalb der Runde vor (1, 2, 3, …). Trifft eine Anfrage auf eine
 * bereits belegte Position mit IDENTISCHEM Inhalt, wird nichts erneut gebucht — die Antwort wird
 * rein aus dem bereits gespeicherten Protokoll wiederhergestellt. Bei ABWEICHENDEM Inhalt an
 * derselben Position ist das ein echter Konflikt (z. B. verwechselte Zustände im Client) und wird
 * abgelehnt.
 */

export interface ApplyActionInput {
  userId: string;
  roundId: string;
  seq: number;
  action: string;
  payload: unknown;
}

export interface ApplyActionOpenData {
  roundId: string;
  status: "open";
  nextSeq: number;
  stakeMinor: number;
  state: unknown;
  /** Auch bei offener Runde nötig: Verdoppeln/Teilen bucht sofort einen Zusatzeinsatz (Auftrag §2). */
  wallet: { demoBalanceMinor: number; bonusBalanceMinor: number; freeSpins: number };
}

export interface ApplyActionSettledData {
  roundId: string;
  status: "settled";
  nextSeq: number;
  stakeMinor: number;
  returnMinor: number;
  /** returnMinor − stakeMinor (Ergebnis-Display bleibt netto, CLAUDE.md „Harte Invarianten"). */
  netMinor: number;
  outcomeKey: string;
  outcomeLabel: string;
  seed: number;
  state: unknown;
  wallet: { demoBalanceMinor: number; bonusBalanceMinor: number; freeSpins: number };
  /**
   * Engine-spezifische Zusatzdaten für die Anzeige (z. B. Blackjack: Ergebnis je Hand). Der
   * Client zeichnet NUR, was hier steht — keine lokale Nachrechnung anhand aufgedeckter Karten,
   * auch wenn das nach Rundenende technisch ungefährlich wäre (Auftrag: „Keine lokale Vorhersage
   * des Ergebnisses").
   */
  detail?: Record<string, unknown>;
}

export type ApplyActionData = ApplyActionOpenData | ApplyActionSettledData;
export type ApplyActionResult = { ok: true; data: ApplyActionData } | { ok: false; code: WalletRejectionCode };

function toWallet(record: WalletRecord): Wallet {
  return { demoBalanceMinor: record.demoBalanceMinor, bonusBalanceMinor: record.bonusBalanceMinor, freeSpins: record.freeSpins, roundInFlight: false };
}

function toSnapshot(record: WalletRecord) {
  return { demoBalanceMinor: record.demoBalanceMinor, bonusBalanceMinor: record.bonusBalanceMinor, freeSpins: record.freeSpins };
}

/**
 * Strukturelle Gleichheit für JSON-Nutzlasten (Idempotenzvergleich). `jsonb`-Spalten garantieren
 * keine Schlüsselreihenfolge — ein naiver `JSON.stringify`-Vergleich wäre also nicht verlässlich.
 */
function deepEqualJson(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((v, i) => deepEqualJson(v, b[i]));
  }
  if (typeof a === "object" && a !== null && typeof b === "object" && b !== null) {
    const ak = Object.keys(a as Record<string, unknown>).sort();
    const bk = Object.keys(b as Record<string, unknown>).sort();
    if (ak.length !== bk.length || ak.some((k, i) => k !== bk[i])) return false;
    return ak.every((k) => deepEqualJson((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
  }
  return false;
}

/**
 * Wendet den kompletten Ablauf EINER Aktion für einen beliebigen Adapter an — generisch über
 * `TState`, damit die drei Engines (siehe unten) diese Logik nicht dreimal duplizieren müssen.
 */
async function processAction<TState>(
  tx: AppDatabase,
  round: GameRoundRecord,
  transcript: InteractiveRoundTranscript,
  history: GameRoundActionRecord[],
  input: ApplyActionInput,
  runner: InteractiveEngineRunner<TState>,
): Promise<ApplyActionResult> {
  // `round.stakeMinor` ist IMMER der deklarierte Einsatzwert, den die Engine für die Kartenwerte /
  // Auszahlungsgrößen braucht (Auftrag: gleicher Seed + gleicher Einsatz ⇒ gleiches Ergebnis) —
  // auch bei einer Freirunde, wo nichts vom Guthaben abgebucht wurde. `walletStakeMinor` ist die
  // davon zu unterscheidende Grundlage für Netto-Anzeige und Zusatzeinsatz-Obergrenze (0 bei
  // Freirunde, spiegelt state/wallet-reducer.ts::settle() bzw. round-service.ts::toData()).
  const startCtx = { seed: round.seed, stakeMinor: round.stakeMinor, betKey: round.betKey };
  const applyCtx = { seed: round.seed, stakeMinor: round.stakeMinor };
  const walletStakeMinor = transcript.usedFreeSpin ? 0 : round.stakeMinor;

  /** Zustand UND effektiven Gesamteinsatz nach den ersten `upTo` protokollierten Aktionen ableiten. */
  function replay(upTo: number): { state: TState; totalStakeMinor: number } {
    let state = runner.start(startCtx);
    let totalStakeMinor = walletStakeMinor;
    for (let i = 0; i < upTo; i++) {
      const a = history[i];
      if (!a) break;
      totalStakeMinor += runner.additionalStake(state, a.action, a.payload);
      state = runner.apply(state, a.action, a.payload, applyCtx);
    }
    return { state, totalStakeMinor };
  }

  const expectedNextSeq = history.length + 1;

  if (input.seq < 1) return { ok: false, code: "INVALID_STAKE" };

  if (input.seq < expectedNextSeq) {
    // Möglicher Wiederholungsversuch (Doppelklick, Netzwerk-Retry): diese Position ist bereits
    // belegt. Bei identischem Inhalt wird NICHTS erneut gebucht — die Antwort entsteht rein aus
    // einer erneuten, seiteneffektfreien Wiedergabe bis zu genau dieser Position.
    const stored = history[input.seq - 1];
    if (!stored || stored.action !== input.action || !deepEqualJson(stored.payload, input.payload)) {
      return { ok: false, code: "INVALID_STAKE" };
    }
    const before = replay(input.seq - 1);
    const additional = runner.additionalStake(before.state, stored.action, stored.payload);
    const stateAfter = runner.apply(before.state, stored.action, stored.payload, applyCtx);
    const finished = runner.isFinished(stateAfter);
    const totalStakeMinor = before.totalStakeMinor + additional;
    return buildResponse(tx, round, runner, stateAfter, finished, totalStakeMinor, null);
  }

  if (input.seq > expectedNextSeq) return { ok: false, code: "INVALID_STAKE" };

  const { state, totalStakeMinor: stakeBeforeAction } = replay(history.length);
  if (runner.isFinished(state)) return { ok: false, code: "NO_PENDING_ROUND" };

  const check = runner.check(state, input.action, input.payload);
  if (!check.ok) return { ok: false, code: check.code };

  const additionalMinor = runner.additionalStake(state, input.action, input.payload);
  let walletAfterDebit: WalletRecord | null = null;
  if (additionalMinor > 0) {
    const raiseCheck = checkRaiseAllowed(
      { interactive: true, usedFreeSpin: transcript.usedFreeSpin, stakeMinor: stakeBeforeAction, baseStakeMinor: round.stakeMinor },
      additionalMinor,
    );
    if (!raiseCheck.ok) return { ok: false, code: raiseCheck.code };
    const wallet = await findWallet(tx, input.userId);
    if (!wallet) throw new Error(`Wallet für Nutzer „${input.userId}" fehlt — Zusatzeinsatz kann nicht gebucht werden.`);
    const split = splitStakeAcrossBalances(toWallet(wallet), additionalMinor);
    const debit = await debitForStake(tx, input.userId, { fromBonusMinor: split.fromBonus, fromDemoMinor: split.fromDemo });
    // Null betroffene Zeilen (wie Auftrag §2 in round-service.ts): das bedingte UPDATE ist der
    // eigentliche Schutz gegen Wettläufe — die Zeilensperre auf game_round serialisiert hier
    // zusätzlich gleichzeitige Aktionen auf DERSELBEN Runde, ersetzt aber nicht die WHERE-Bedingung.
    if (!debit.ok) return { ok: false, code: "INSUFFICIENT_FUNDS" };
    walletAfterDebit = debit.walletRecord;
    await insertLedgerEntry(tx, {
      userId: input.userId,
      seq: debit.walletRecord.nextSeq - 1,
      type: "demo_bet",
      amountMinor: -additionalMinor,
      balanceAfterMinor: debit.walletRecord.demoBalanceMinor + debit.walletRecord.bonusBalanceMinor,
      fromDemoMinor: split.fromDemo,
      fromBonusMinor: split.fromBonus,
      gameModeId: round.gameModeId,
      roundId: round.id,
    });
  }

  const inserted = await insertRoundAction(tx, {
    id: createId("ra"),
    roundId: round.id,
    seq: input.seq,
    action: input.action as GameRoundActionName,
    payload: input.payload,
  });
  if (!inserted) {
    // Die Zeilensperre auf game_round hält diese Transaktion exklusiv für die Runde — ein
    // Konflikt hier wäre ein Programmierfehler (derselbe seq-Wert wurde oben als frei geprüft),
    // kein erwarteter Nutzerzustand. Kein stiller Fallback bei einer bereits gebuchten Bewegung.
    throw new Error(`Aktion (Runde „${round.id}", seq ${input.seq}) konnte nicht gespeichert werden — Positionskonflikt trotz Zeilensperre.`);
  }

  const nextState = runner.apply(state, input.action, input.payload, applyCtx);
  const finished = runner.isFinished(nextState);
  const totalStakeMinor = stakeBeforeAction + additionalMinor;
  return buildResponse(tx, round, runner, nextState, finished, totalStakeMinor, walletAfterDebit);
}

async function buildResponse<TState>(
  tx: AppDatabase,
  round: GameRoundRecord,
  runner: InteractiveEngineRunner<TState>,
  state: TState,
  finished: boolean,
  totalStakeMinor: number,
  walletAfterDebit: WalletRecord | null,
): Promise<ApplyActionResult> {
  if (!finished) {
    const wallet = walletAfterDebit ?? (await findWallet(tx, round.userId));
    if (!wallet) throw new Error(`Wallet für Nutzer „${round.userId}" fehlt.`);
    const actionCount = (await findActionsForRound(tx, round.id)).length;
    return {
      ok: true,
      data: {
        roundId: round.id,
        status: "open",
        nextSeq: actionCount + 1,
        stakeMinor: totalStakeMinor,
        state: runner.publicView(state, false, { seed: round.seed }),
        wallet: toSnapshot(wallet),
      },
    };
  }

  const settlement = runner.settle(state, round.stakeMinor);
  if (!Number.isInteger(settlement.returnMinor) || settlement.returnMinor < 0) {
    throw new Error(`Adapter (Runde „${round.id}") hat ein ungültiges Ergebnis geliefert: ${settlement.returnMinor}`);
  }
  const walletAfterCredit = await creditReturn(tx, round.userId, settlement.returnMinor, MAX_BALANCE_MINOR);
  await insertLedgerEntry(tx, {
    userId: round.userId,
    seq: walletAfterCredit.nextSeq - 1,
    type: "demo_win",
    amountMinor: settlement.returnMinor,
    balanceAfterMinor: walletAfterCredit.demoBalanceMinor + walletAfterCredit.bonusBalanceMinor,
    gameModeId: round.gameModeId,
    roundId: round.id,
  });
  const settledTranscript = { ...(isInteractiveRoundTranscript(round.transcript) ? round.transcript : {}), final: settlement.detail };
  await settleRound(tx, round.id, { outcomeKey: settlement.outcomeKey, returnMinor: settlement.returnMinor, transcript: settledTranscript });
  const finalActionCount = (await findActionsForRound(tx, round.id)).length;

  return {
    ok: true,
    data: {
      roundId: round.id,
      status: "settled",
      nextSeq: finalActionCount + 1,
      stakeMinor: totalStakeMinor,
      returnMinor: settlement.returnMinor,
      netMinor: settlement.returnMinor - totalStakeMinor,
      outcomeKey: settlement.outcomeKey,
      outcomeLabel: settlement.outcomeLabel,
      seed: round.seed,
      state: runner.publicView(state, true, { seed: round.seed }),
      wallet: toSnapshot(walletAfterCredit),
      ...(Object.keys(settlement.detail).length > 0 ? { detail: settlement.detail } : {}),
    },
  };
}

/**
 * Öffentlicher Einstiegspunkt (Auftrag §2, `POST /api/rounds/:id/actions`). `input.userId` MUSS
 * aus der geprüften Sitzung stammen — kein Aufruf hier übernimmt eine `userId` direkt aus einem
 * Request-Body (derselbe Grundsatz wie `server/rounds/round-service.ts`).
 */
export async function applyRoundAction(db: AppDatabase, input: ApplyActionInput): Promise<ApplyActionResult> {
  return db.transaction(async (tx) => {
    const round = await findRoundForUpdate(tx, input.roundId);
    // Dieselbe Ablehnung für „Runde existiert nicht" und „Runde gehört jemand anderem" — sonst
    // ließe sich über den Fehlercode erraten, ob eine fremde Runden-ID existiert.
    if (!round || round.userId !== input.userId) return { ok: false, code: "NO_PENDING_ROUND" };
    if (round.status !== "open") return { ok: false, code: "NO_PENDING_ROUND" };

    const transcript = isInteractiveRoundTranscript(round.transcript) ? round.transcript : null;
    if (!transcript) {
      throw new Error(`Runde „${round.id}" hat kein gültiges interaktives Transkript — Zustand kann nicht abgeleitet werden.`);
    }

    const history = await findActionsForRound(tx, round.id);

    switch (transcript.engine) {
      case "mines":
        return processAction(tx, round, transcript, history, input, minesRunner);
      case "blackjack":
        return processAction(tx, round, transcript, history, input, blackjackRunner);
      case "videopoker":
        return processAction(tx, round, transcript, history, input, videoPokerRunner);
      default: {
        const _exhaustive: never = transcript.engine;
        throw new Error(`Unbekannte interaktive Engine: ${String(_exhaustive)}`);
      }
    }
  });
}
