import { randomInt } from "node:crypto";
import type { AppDatabase } from "@/server/db/types";
import { PgGameModeRepository } from "@/server/repositories/game-mode-repository";
import { consumeFreeSpin, creditReturn, debitForStake, findWallet, insertWalletIfMissing, type WalletRecord } from "@/server/repositories/wallet-repository";
import { insertLedgerEntry } from "@/server/repositories/ledger-repository";
import { findByIdempotencyKey, insertOpenRound, settleRound, type GameRoundRecord } from "@/server/repositories/game-round-repository";
import { NON_INTERACTIVE_ENGINE_KEYS, resolveNonInteractiveOutcome } from "./engine-resolvers";
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

/**
 * Rundenservice für die sechs nicht-interaktiven Spielfamilien (Auftrag §3). Autorisierung
 * passiert HIER, nicht nur im Route Handler: `input.userId` MUSS aus der geprüften Sitzung
 * stammen (app/api/rounds/start/route.ts liest sie über getSession()/createGuestAccount()) —
 * kein Repository-Aufruf in dieser Datei übernimmt eine `userId` direkt aus einem Request-Body.
 *
 * Ablauf (eine Datenbanktransaktion ab dem Zeitpunkt, an dem Geld bewegt wird):
 *  1. Spielmodus laden, Einsatzbereich und Familie prüfen (rein lesend, vor der Transaktion).
 *  2. Seed serverseitig erzeugen (`crypto.randomInt`) und die Runde mit der UNVERÄNDERTEN
 *     Engine-Logik aus components/game/engine/**​/*-logic.ts auflösen — rein, ohne DB-Zugriff.
 *  3. Transaktion: Wallet sicherstellen (+ Startguthaben-Buchung bei Neuanlage), Idempotenz
 *     prüfen, Einsatz bedingt abbuchen, Runde anlegen, Rückgabe gutschreiben, Runde abschließen.
 *     Jeder Schritt bucht höchstens einen Ledger-Eintrag je Guthabenänderung (Invariante 2).
 */

export interface StartRoundInput {
  userId: string;
  gameModeId: string;
  stakeMinor: number;
  idempotencyKey: string;
  useFreeSpin?: boolean;
  betId?: string;
  bet?: unknown;
}

export interface RoundWalletSnapshot {
  demoBalanceMinor: number;
  bonusBalanceMinor: number;
  freeSpins: number;
}

export interface StartRoundData {
  roundId: string;
  gameModeId: string;
  stakeMinor: number;
  returnMinor: number;
  /** returnMinor − stakeMinor (Ergebnis-Display bleibt netto, CLAUDE.md „Harte Invarianten"). */
  netMinor: number;
  outcomeKey: string;
  outcomeLabel: string;
  seed: number;
  usedFreeSpin: boolean;
  betKey: string | null;
  detail?: Record<string, unknown>;
  wallet: RoundWalletSnapshot;
}

export type StartRoundResult = { ok: true; data: StartRoundData } | { ok: false; code: WalletRejectionCode };

function toWallet(record: WalletRecord): Wallet {
  return {
    demoBalanceMinor: record.demoBalanceMinor,
    bonusBalanceMinor: record.bonusBalanceMinor,
    freeSpins: record.freeSpins,
    roundInFlight: false,
  };
}

function toSnapshot(record: WalletRecord): RoundWalletSnapshot {
  return { demoBalanceMinor: record.demoBalanceMinor, bonusBalanceMinor: record.bonusBalanceMinor, freeSpins: record.freeSpins };
}

/** Transcript-Form der Runde (jsonb) — genug, um dieselbe Runde später erneut aufzulösen (Wiedergabetest). */
interface RoundTranscript {
  betId?: string;
  bet?: unknown;
  outcomeLabel: string;
  usedFreeSpin: boolean;
  detail?: Record<string, unknown>;
}

function isRoundTranscript(value: unknown): value is RoundTranscript {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Record<string, unknown>).outcomeLabel === "string" &&
    typeof (value as Record<string, unknown>).usedFreeSpin === "boolean"
  );
}

function toData(round: GameRoundRecord, wallet: WalletRecord): StartRoundData {
  if (round.status !== "settled" || round.returnMinor === null || round.outcomeKey === null) {
    // Kann laut Ablauf oben nie eintreten (settleRound() liefert immer eine settled-Zeile) — kein
    // stiller Fallback bei einem Geldwert, deshalb ein klarer Fehler statt eines geratenen Werts.
    throw new Error(`Runde „${round.id}" ist nicht abgeschlossen — Antwort kann nicht gebaut werden.`);
  }
  const transcript = isRoundTranscript(round.transcript) ? round.transcript : { outcomeLabel: round.outcomeKey, usedFreeSpin: false };
  return {
    roundId: round.id,
    gameModeId: round.gameModeId,
    stakeMinor: round.stakeMinor,
    returnMinor: round.returnMinor,
    netMinor: round.returnMinor - round.stakeMinor,
    outcomeKey: round.outcomeKey,
    outcomeLabel: transcript.outcomeLabel,
    seed: round.seed,
    usedFreeSpin: transcript.usedFreeSpin,
    betKey: round.betKey,
    ...(transcript.detail ? { detail: transcript.detail } : {}),
    wallet: toSnapshot(wallet),
  };
}

export async function startNonInteractiveRound(db: AppDatabase, input: StartRoundInput): Promise<StartRoundResult> {
  const gameModeRepo = new PgGameModeRepository(db);
  const mode = await gameModeRepo.findById(input.gameModeId);
  if (!mode || mode.status !== "active" || !NON_INTERACTIVE_ENGINE_KEYS.has(mode.engineKey)) {
    return { ok: false, code: "INVALID_STAKE" };
  }

  const stakeCheck = checkStakeRange(input.stakeMinor, mode.minBetMinor, mode.maxBetMinor);
  if (!stakeCheck.ok) return { ok: false, code: stakeCheck.code };

  // Seed und Ergebnis stehen VOR der Transaktion fest — reine Berechnung, kein DB-Zugriff. Der
  // Client hat darauf keinen Einfluss: `crypto.randomInt` läuft ausschließlich hier, nie im Browser.
  const seed = randomInt(0, 2 ** 31);
  const resolved = resolveNonInteractiveOutcome(mode.engineKey, {
    gameModeId: mode.id,
    stakeMinor: input.stakeMinor,
    seed,
    ...(input.betId === undefined ? {} : { betId: input.betId }),
    ...(input.bet === undefined ? {} : { bet: input.bet }),
  });
  if (!resolved.ok) return { ok: false, code: resolved.code };
  const { outcome, betKey } = resolved;
  if (!Number.isInteger(outcome.returnMinor) || outcome.returnMinor < 0) {
    throw new Error(`Engine „${mode.engineKey}" (${mode.id}) hat ein ungültiges Ergebnis geliefert: ${outcome.returnMinor}`);
  }

  return db.transaction(async (tx) => {
    const existing = await findByIdempotencyKey(tx, input.userId, input.idempotencyKey);
    if (existing) {
      // Idempotenz (Auftrag §3/§8): derselbe Schlüssel liefert das bereits gebuchte Ergebnis
      // zurück, ohne ein zweites Mal zu buchen. `status !== "settled"` sollte praktisch nie
      // eintreten (jede offene Runde wird innerhalb derselben Transaktion sofort abgeschlossen,
      // siehe Dateikommentar) — kein stiller Fallback, sondern ein sichtbarer Ablehnungsgrund.
      // ABSICHTLICH ohne erneute RG-Prüfung: nichts wird hier neu gebucht, eine nachträgliche
      // Sperre darf ein bereits abgeschlossenes Ergebnis nicht rückwirkend verstecken.
      if (existing.status !== "settled") return { ok: false, code: "ROUND_IN_FLIGHT" };
      const currentWallet = await findWallet(tx, input.userId);
      if (!currentWallet) {
        // Eine bereits abgeschlossene Runde setzt eine gebuchte Wallet-Zeile voraus (sie wurde
        // beim ursprünglichen Rundenstart angelegt) — ihr Fehlen wäre ein Dateninkonsistenz-
        // Fehler, kein Nutzerzustand. Kein stiller Fallback bei einem Geldwert.
        throw new Error(`Wallet für Nutzer „${input.userId}" fehlt trotz bereits abgeschlossener Runde „${existing.id}".`);
      }
      return { ok: true, data: toData(existing, currentWallet) };
    }

    // Responsible-Gaming-Sperre (Auftrag „Server statt Client", der eigentliche Kern): läuft
    // INNERHALB dieser Transaktion, gegen den Datenbankstand — vor JEDER Buchung, einschließlich
    // der Wallet-Anlage/Startguthaben-Gutschrift unten. Ein gesperrter Nutzer bekommt dadurch bei
    // einem abgelehnten Rundenstart weder ein neues Wallet noch eine Startguthaben-Buchung.
    const rgCheck = await assertRgNotBlocked(tx, input.userId, nowIso());
    if (!rgCheck.ok) return { ok: false, code: rgCheck.code };

    const { walletRecord: freshWallet, created } = await insertWalletIfMissing(tx, input.userId, START_BALANCE_MINOR);
    if (created) {
      // Auftrag §7: Startguthaben ist eine Buchung, kein stiller Anfangswert.
      await insertLedgerEntry(tx, {
        userId: input.userId,
        seq: 1,
        type: "demo_credit",
        amountMinor: START_BALANCE_MINOR,
        balanceAfterMinor: START_BALANCE_MINOR,
      });
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
      // Früher, nicht-race-sicherer Vorabcheck für die häufige Fehlermeldung ohne DB-Rundreise —
      // die eigentliche, race-sichere Prüfung ist das bedingte UPDATE direkt darunter.
      const fundsCheck = checkFundsAvailable(toWallet(freshWallet), input.stakeMinor);
      if (!fundsCheck.ok) return { ok: false, code: fundsCheck.code };
      const split = splitStakeAcrossBalances(toWallet(freshWallet), input.stakeMinor);
      fromDemoMinor = split.fromDemo;
      fromBonusMinor = split.fromBonus;
      const debit = await debitForStake(tx, input.userId, { fromBonusMinor, fromDemoMinor });
      // Null betroffene Zeilen (Auftrag §2): ein gleichzeitiger Einsatz hat das Guthaben zwischen
      // Vorabcheck und bedingtem UPDATE verbraucht. Rollback der gesamten Transaktion — nichts
      // wird gebucht, die Ablehnung ist für den Client sichtbar, kein stiller Fallback.
      if (!debit.ok) return { ok: false, code: "INSUFFICIENT_FUNDS" };
      walletAfterDebit = debit.walletRecord;
    }

    const roundId = createId("r");
    const stakeBooked = usedFreeSpin ? 0 : input.stakeMinor;
    const transcript: RoundTranscript = {
      ...(input.betId === undefined ? {} : { betId: input.betId }),
      ...(input.bet === undefined ? {} : { bet: input.bet }),
      outcomeLabel: outcome.outcomeLabel,
      usedFreeSpin,
      ...(outcome.detail ? { detail: outcome.detail } : {}),
    };
    const inserted = await insertOpenRound(tx, {
      id: roundId,
      userId: input.userId,
      gameModeId: mode.id,
      ...(betKey ? { betKey } : {}),
      stakeMinor: stakeBooked,
      seed,
      maxReturnMinor: outcome.returnMinor,
      idempotencyKey: input.idempotencyKey,
      transcript,
    });
    if (!inserted) {
      // `insertOpenRound` liefert `null` bei JEDEM Unique-Verstoß (server/repositories/game-round-
      // repository.ts): entweder ein Rennen mit der Idempotenzprüfung oben (praktisch nur bei zwei
      // exakt gleichzeitigen Anfragen mit demselben Schlüssel) oder — theoretisch, siehe Kommentar
      // zum Wallet-Zeilenschloss oben — eine bereits offene Runde desselben Nutzers (partieller
      // Unique-Index, Invariante 4). Für beide Fälle ist Rollback die sichere Antwort: kein
      // Teilzustand, kein verlorenes Geld, ein erneuter Versuch (ggf. mit neuem Schlüssel) ist sicher.
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

    // Rückgabe gutschreiben — auch bei 0 (Nullrunde): jede Runde schließt mit genau einer
    // demo_win-Buchung ab, unabhängig vom Betrag (spiegelt state/wallet-reducer.ts::settle()).
    const walletAfterCredit = await creditReturn(tx, input.userId, outcome.returnMinor, MAX_BALANCE_MINOR);
    const availableAfterCredit = walletAfterCredit.demoBalanceMinor + walletAfterCredit.bonusBalanceMinor;
    await insertLedgerEntry(tx, {
      userId: input.userId,
      seq: walletAfterCredit.nextSeq - 1,
      type: "demo_win",
      amountMinor: outcome.returnMinor,
      balanceAfterMinor: availableAfterCredit,
      gameModeId: mode.id,
      roundId,
    });

    const settled = await settleRound(tx, roundId, {
      outcomeKey: outcome.outcomeKey,
      returnMinor: outcome.returnMinor,
      transcript,
    });

    return { ok: true, data: toData(settled, walletAfterCredit) };
  });
}
