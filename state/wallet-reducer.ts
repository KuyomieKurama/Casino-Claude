import type { CreditsMinor } from "@/types/money";
import type { Transaction, TransactionType } from "@/types/transaction";
import type { Wallet } from "@/types/wallet";
import { MAX_BALANCE_MINOR, START_BALANCE_MINOR } from "@/lib/constants";
import {
  availableMinor,
  checkFreeSpinAvailable,
  checkFundsAvailable,
  checkMaxBalanceAfterCredit,
  checkRaiseAllowed,
  checkRgNotBlocked,
  checkRoundNotInFlight,
  checkSettleReturnOverride,
  checkStakeRange,
  computeRaisedMaxReturn,
  resolveRoundMaxReturn,
  splitStakeAcrossBalances,
  type WalletRejectionCode,
} from "@/lib/wallet-policy";

/**
 * Wallet-Reducer. Hier — und nur hier — gelten die Invarianten aus §6:
 *  1. Guthaben nie negativ; Einsätze über dem Bestand werden abgelehnt, nicht gekappt.
 *  2. Jede Guthabenänderung erzeugt genau eine Transaktion.
 *  3. balanceAfterMinor entspricht immer dem Guthaben nach dem Vorgang.
 *  4. Bei roundInFlight === true wird keine zweite Runde angenommen.
 *  5. Bei aktiver Selbstsperre oder Pause werden alle einsatzbezogenen Aktionen abgelehnt.
 * Die Entscheidungsregeln selbst stehen in lib/wallet-policy.ts (rein, ohne React/State) — hier
 * werden nur noch Zustandsübergänge vollzogen und Transaktionen gebucht. Die UI prüft nichts
 * davon selbst; sie zeigt nur lastRejection an.
 */

// Re-Export, damit bestehende Importe aus state/wallet-reducer unverändert funktionieren.
export type { WalletRejectionCode } from "@/lib/wallet-policy";
export { availableMinor } from "@/lib/wallet-policy";

export type WalletRejection = { code: WalletRejectionCode; message: string; at: string };

export type PendingRound = {
  roundId: string;
  gameId: string;
  stakeMinor: CreditsMinor;
  returnMinor: CreditsMinor;
  outcomeKey: string;
  seed: number;
  usedFreeSpin: boolean;
  startedAt: string;
  interactive: boolean;
  maxReturnMinor: CreditsMinor;
  /** Grundeinsatz beim Start — begrenzt, wie weit RAISE_ROUND_STAKE gehen darf. */
  baseStakeMinor: CreditsMinor;
};

export type WalletState = {
  hydrated: boolean;
  wallet: Wallet;
  transactions: Transaction[];
  nextSeq: number;
  pendingRound: PendingRound | null;
  lastRejection: WalletRejection | null;
};

/** Kontext, den der Provider (nicht die UI) jeder Aktion beilegt. */
export type WalletCtx = {
  userId: string;
  now: string;
  /** true bei aktiver Selbstsperre, Pause oder erreichtem Demo-Limit (aus dem RgContext). */
  rgBlocked: boolean;
};

export type StartRoundInput = {
  roundId: string;
  gameId: string;
  stakeMinor: CreditsMinor;
  minStakeMinor: CreditsMinor;
  maxStakeMinor: CreditsMinor;
  /** Bereits berechnetes Ergebnis (reine Funktion aus Seed + Tabelle), damit die Runde bei Abbruch nachvollziehbar bleibt. */
  returnMinor: CreditsMinor;
  outcomeKey: string;
  seed: number;
  useFreeSpin?: boolean;
  /**
   * Interaktive Runde (Blackjack, Mines): das Ergebnis steht erst nach Spielerentscheidungen fest.
   * Dann MUSS `maxReturnMinor` gesetzt sein — der Reducer akzeptiert beim Abschluss nur Rückgaben
   * bis zu dieser im Voraus deklarierten Obergrenze. Die UI kann also keinen Betrag erfinden.
   */
  interactive?: boolean;
  maxReturnMinor?: CreditsMinor;
};

export type WalletAction =
  | { type: "HYDRATE"; slice: unknown; ctx: WalletCtx }
  | { type: "TOP_UP"; amountMinor: CreditsMinor; ctx: WalletCtx }
  | { type: "RESET"; ctx: WalletCtx }
  | { type: "START_ROUND"; input: StartRoundInput; ctx: WalletCtx }
  | { type: "SETTLE_ROUND"; roundId: string; ctx: WalletCtx; returnMinor?: CreditsMinor; outcomeKey?: string }
  | { type: "RAISE_ROUND_STAKE"; roundId: string; additionalMinor: CreditsMinor; ctx: WalletCtx }
  | { type: "GRANT_BONUS"; bonusMinor: CreditsMinor; freeSpins: number; sourceId: string; ctx: WalletCtx }
  | { type: "CLEAR_REJECTION" }
  /**
   * Phase 3a: Guthabenstand nach einer serverseitig aufgelösten, nicht-interaktiven Runde
   * (`state/WalletContext.tsx::syncServerWallet`). Die Buchung selbst (Einsatz, Ergebnis, Ledger)
   * ist zu diesem Zeitpunkt bereits serverseitig abgeschlossen — hier wird NUR die Anzeige
   * nachgeführt, es wird keine weitere Transaktion erzeugt (die liegt bereits im Server-Ledger)
   * und `roundInFlight`/`pendingRound` bleiben unberührt, damit eine parallel laufende
   * interaktive Runde (Blackjack, Mines) davon nicht betroffen ist.
   */
  | { type: "SERVER_WALLET_SYNC"; wallet: { demoBalanceMinor: CreditsMinor; bonusBalanceMinor: CreditsMinor; freeSpins: number } };

export const MAX_STORED_TRANSACTIONS = 500;

export const initialWallet: Wallet = {
  demoBalanceMinor: START_BALANCE_MINOR,
  bonusBalanceMinor: 0,
  freeSpins: 0,
  roundInFlight: false,
};

export function createInitialWalletState(seedTransactions: readonly Transaction[] = []): WalletState {
  const nextSeq = seedTransactions.reduce((m, t) => Math.max(m, t.seq), 0) + 1;
  return {
    hydrated: false,
    wallet: { ...initialWallet },
    transactions: [...seedTransactions],
    nextSeq,
    pendingRound: null,
    lastRejection: null,
  };
}

const messages: Record<WalletRejectionCode, string> = {
  INSUFFICIENT_FUNDS: "Dein Demo-Guthaben reicht für diese Runde nicht aus. Setze es zurück oder füge Demo-Credits hinzu.",
  ROUND_IN_FLIGHT: "Eine Runde läuft bereits. Warte, bis sie abgeschlossen ist.",
  RG_BLOCKED: "Spielstart ist zurzeit blockiert (Pause, Limit oder Selbstsperre). Details unter Responsible Gaming.",
  INVALID_STAKE: "Der Einsatz liegt außerhalb des erlaubten Demo-Bereichs für dieses Spiel.",
  NO_PENDING_ROUND: "Es gibt keine offene Runde, die abgeschlossen werden könnte.",
  MAX_BALANCE: "Das Demo-Guthaben hat die Obergrenze erreicht. Setze es zurück, um weiterzuspielen.",
  NO_FREE_SPINS: "Es sind keine Freirunden mehr übrig.",
  RETURN_OUT_OF_RANGE: "Das Rundenergebnis liegt außerhalb des für diese Runde deklarierten Rahmens.",
  RAISE_NOT_ALLOWED: "Der Einsatz dieser Runde lässt sich nicht erhöhen.",
  SERVER_ERROR: "Der Server ist gerade nicht erreichbar oder hat unerwartet geantwortet. Bitte versuche es erneut.",
};

/**
 * Exportiert (Phase 3a): `useRound.ts` baut für serverseitig aufgelöste Runden (nicht-interaktive
 * Spiele) eigene `WalletRejection`-Objekte aus dem Fehlercode der Server-Antwort — dieselbe
 * deutsche Meldung wie hier, ohne sie zu duplizieren (Auftrag: „damit die vorhandenen deutschen
 * Meldungen weiterverwendet werden können").
 */
export function rejectionMessage(code: WalletRejectionCode): string {
  return messages[code];
}

function reject(state: WalletState, code: WalletRejectionCode, now: string): WalletState {
  return { ...state, lastRejection: { code, message: messages[code], at: now } };
}

type BookInput = {
  type: TransactionType;
  amountMinor: CreditsMinor;
  gameId?: string;
  roundId?: string;
};

/**
 * Bucht genau eine Transaktion und setzt balanceAfterMinor auf das Gesamtguthaben nach dem
 * Vorgang. Der Aufrufer hat das Wallet bereits geändert; hier wird nur noch protokolliert.
 */
function book(state: WalletState, wallet: Wallet, input: BookInput, ctx: WalletCtx): WalletState {
  const seq = state.nextSeq;
  const tx: Transaction = {
    id: `tx_${seq}`,
    seq,
    userId: ctx.userId,
    type: input.type,
    amountMinor: input.amountMinor,
    balanceAfterMinor: availableMinor(wallet),
    ...(input.gameId ? { gameId: input.gameId } : {}),
    ...(input.roundId ? { roundId: input.roundId } : {}),
    createdAt: ctx.now,
    isDemo: true,
  };
  const transactions = [...state.transactions, tx];
  if (transactions.length > MAX_STORED_TRANSACTIONS) {
    transactions.splice(0, transactions.length - MAX_STORED_TRANSACTIONS);
  }
  return { ...state, wallet, transactions, nextSeq: seq + 1, lastRejection: null };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function isNonNegativeInt(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 0;
}

function parseWallet(v: unknown): Wallet | null {
  if (!isRecord(v)) return null;
  if (!isNonNegativeInt(v.demoBalanceMinor) || !isNonNegativeInt(v.bonusBalanceMinor) || !isNonNegativeInt(v.freeSpins)) return null;
  return {
    demoBalanceMinor: v.demoBalanceMinor,
    bonusBalanceMinor: v.bonusBalanceMinor,
    freeSpins: v.freeSpins,
    // roundInFlight wird nie „wahr“ hydriert; eine offene Runde wird über pendingRound abgeschlossen.
    roundInFlight: false,
  };
}

function parseTransactions(v: unknown): Transaction[] | null {
  if (!Array.isArray(v)) return null;
  const out: Transaction[] = [];
  for (const t of v) {
    if (!isRecord(t)) return null;
    if (typeof t.id !== "string" || typeof t.seq !== "number" || typeof t.type !== "string") return null;
    if (typeof t.amountMinor !== "number" || typeof t.balanceAfterMinor !== "number") return null;
    if (typeof t.createdAt !== "string" || typeof t.userId !== "string") return null;
    out.push({
      id: t.id,
      seq: t.seq,
      userId: t.userId,
      type: t.type as TransactionType,
      amountMinor: t.amountMinor,
      balanceAfterMinor: t.balanceAfterMinor,
      ...(typeof t.gameId === "string" ? { gameId: t.gameId } : {}),
      ...(typeof t.roundId === "string" ? { roundId: t.roundId } : {}),
      createdAt: t.createdAt,
      isDemo: true,
    });
  }
  return out;
}

function parsePendingRound(v: unknown): PendingRound | null {
  if (!isRecord(v)) return null;
  if (typeof v.roundId !== "string" || typeof v.gameId !== "string") return null;
  if (!isNonNegativeInt(v.stakeMinor) || !isNonNegativeInt(v.returnMinor)) return null;
  if (typeof v.outcomeKey !== "string" || typeof v.seed !== "number" || typeof v.startedAt !== "string") return null;
  return {
    roundId: v.roundId,
    gameId: v.gameId,
    stakeMinor: v.stakeMinor,
    returnMinor: v.returnMinor,
    outcomeKey: v.outcomeKey,
    seed: v.seed,
    usedFreeSpin: v.usedFreeSpin === true,
    startedAt: v.startedAt,
    interactive: v.interactive === true,
    maxReturnMinor: isNonNegativeInt(v.maxReturnMinor) ? v.maxReturnMinor : v.returnMinor,
    baseStakeMinor: isNonNegativeInt(v.baseStakeMinor) ? v.baseStakeMinor : v.stakeMinor,
  };
}

/** Persistierte Form der Wallet-Scheibe. */
export function toPersistedWallet(state: WalletState) {
  return {
    wallet: state.wallet,
    transactions: state.transactions,
    nextSeq: state.nextSeq,
    pendingRound: state.pendingRound,
  };
}

function settle(state: WalletState, ctx: WalletCtx, override?: CreditsMinor): WalletState {
  const round = state.pendingRound;
  if (!round) return reject(state, "NO_PENDING_ROUND", ctx.now);

  // Nicht-interaktive Runden schließen immer mit dem beim Start festgelegten Ergebnis ab.
  // Interaktive Runden dürfen ein abweichendes Ergebnis liefern — die Grenzen dafür prüft die Policy.
  let returnMinor = round.returnMinor;
  if (override !== undefined) {
    const overrideCheck = checkSettleReturnOverride(round, override);
    if (!overrideCheck.ok) return reject(state, overrideCheck.code, ctx.now);
    returnMinor = overrideCheck.value;
  }

  const wallet: Wallet = {
    ...state.wallet,
    demoBalanceMinor: Math.min(MAX_BALANCE_MINOR, state.wallet.demoBalanceMinor + returnMinor),
    roundInFlight: false,
  };
  const next = book(
    state,
    wallet,
    { type: "demo_win", amountMinor: returnMinor, gameId: round.gameId, roundId: round.roundId },
    ctx,
  );
  return { ...next, pendingRound: null };
}

export function walletReducer(state: WalletState, action: WalletAction): WalletState {
  switch (action.type) {
    case "HYDRATE": {
      const slice = action.slice;
      if (!isRecord(slice)) return { ...state, hydrated: true };
      const wallet = parseWallet(slice.wallet);
      const transactions = parseTransactions(slice.transactions);
      if (!wallet || !transactions) return { ...state, hydrated: true };
      const maxSeq = transactions.reduce((m, t) => Math.max(m, t.seq), 0);
      const nextSeq = typeof slice.nextSeq === "number" && slice.nextSeq > maxSeq ? slice.nextSeq : maxSeq + 1;
      const pendingRound = parsePendingRound(slice.pendingRound);
      let next: WalletState = {
        ...state,
        hydrated: true,
        wallet,
        transactions,
        nextSeq,
        pendingRound,
        lastRejection: null,
      };
      // Eine beim letzten Besuch unterbrochene Runde wird jetzt abgeschlossen — Einsatz und
      // Ergebnis waren bereits festgelegt, es geht kein Guthaben verloren.
      if (pendingRound) {
        next = { ...next, wallet: { ...next.wallet, roundInFlight: true } };
        next = settle(next, action.ctx);
      }
      return next;
    }

    case "CLEAR_REJECTION":
      return state.lastRejection ? { ...state, lastRejection: null } : state;

    case "TOP_UP": {
      const { amountMinor, ctx } = action;
      if (!Number.isInteger(amountMinor) || amountMinor <= 0) return reject(state, "INVALID_STAKE", ctx.now);
      const maxBalanceCheck = checkMaxBalanceAfterCredit(state.wallet.demoBalanceMinor, amountMinor);
      if (!maxBalanceCheck.ok) return reject(state, maxBalanceCheck.code, ctx.now);
      const wallet: Wallet = { ...state.wallet, demoBalanceMinor: state.wallet.demoBalanceMinor + amountMinor };
      return book(state, wallet, { type: "demo_credit", amountMinor }, ctx);
    }

    case "RESET": {
      const { ctx } = action;
      const inFlightCheck = checkRoundNotInFlight(state.wallet.roundInFlight);
      if (!inFlightCheck.ok) return reject(state, inFlightCheck.code, ctx.now);
      const wallet: Wallet = { ...initialWallet };
      // Die Bewegung ist die Differenz zum bisherigen Gesamtguthaben — so bleibt die Kette prüfbar.
      const amountMinor = availableMinor(wallet) - availableMinor(state.wallet);
      return book(state, wallet, { type: "reset", amountMinor }, ctx);
    }

    case "GRANT_BONUS": {
      const { bonusMinor, freeSpins, ctx } = action;
      if (!Number.isInteger(bonusMinor) || bonusMinor < 0 || !Number.isInteger(freeSpins) || freeSpins < 0) {
        return reject(state, "INVALID_STAKE", ctx.now);
      }
      if (bonusMinor === 0 && freeSpins === 0) return state;
      const wallet: Wallet = {
        ...state.wallet,
        bonusBalanceMinor: state.wallet.bonusBalanceMinor + bonusMinor,
        freeSpins: state.wallet.freeSpins + freeSpins,
      };
      // Auch eine reine Freirunden-Gutschrift wird als Transaktion protokolliert (Betrag 0).
      return book(state, wallet, { type: "bonus_grant", amountMinor: bonusMinor, roundId: action.sourceId }, ctx);
    }

    case "START_ROUND": {
      const { input, ctx } = action;
      const rgCheck = checkRgNotBlocked(ctx.rgBlocked);
      if (!rgCheck.ok) return reject(state, rgCheck.code, ctx.now);
      const inFlightCheck = checkRoundNotInFlight(state.wallet.roundInFlight || state.pendingRound !== null);
      if (!inFlightCheck.ok) return reject(state, inFlightCheck.code, ctx.now);
      const { stakeMinor } = input;
      const stakeRangeCheck = checkStakeRange(stakeMinor, input.minStakeMinor, input.maxStakeMinor);
      if (!stakeRangeCheck.ok) return reject(state, stakeRangeCheck.code, ctx.now);
      if (!Number.isInteger(input.returnMinor) || input.returnMinor < 0) return reject(state, "INVALID_STAKE", ctx.now);
      const maxReturnCheck = resolveRoundMaxReturn(input.interactive === true, input.returnMinor, input.maxReturnMinor);
      if (!maxReturnCheck.ok) return reject(state, maxReturnCheck.code, ctx.now);
      const maxReturnMinor = maxReturnCheck.value;

      if (input.useFreeSpin) {
        const freeSpinCheck = checkFreeSpinAvailable(state.wallet.freeSpins);
        if (!freeSpinCheck.ok) return reject(state, freeSpinCheck.code, ctx.now);
        const wallet: Wallet = { ...state.wallet, freeSpins: state.wallet.freeSpins - 1, roundInFlight: true };
        const next = book(state, wallet, { type: "free_spin", amountMinor: 0, gameId: input.gameId, roundId: input.roundId }, ctx);
        return {
          ...next,
          pendingRound: {
            roundId: input.roundId,
            gameId: input.gameId,
            stakeMinor: 0,
            returnMinor: input.returnMinor,
            outcomeKey: input.outcomeKey,
            seed: input.seed,
            usedFreeSpin: true,
            startedAt: ctx.now,
            interactive: input.interactive === true,
            maxReturnMinor,
            baseStakeMinor: 0,
          },
        };
      }

      const fundsCheck = checkFundsAvailable(state.wallet, stakeMinor);
      if (!fundsCheck.ok) return reject(state, fundsCheck.code, ctx.now);

      // Bonusguthaben zuerst, dann Demo-Guthaben; beides bleibt ≥ 0.
      const { fromBonus, fromDemo } = splitStakeAcrossBalances(state.wallet, stakeMinor);
      const wallet: Wallet = {
        ...state.wallet,
        bonusBalanceMinor: state.wallet.bonusBalanceMinor - fromBonus,
        demoBalanceMinor: state.wallet.demoBalanceMinor - fromDemo,
        roundInFlight: true,
      };
      const next = book(state, wallet, { type: "demo_bet", amountMinor: -stakeMinor, gameId: input.gameId, roundId: input.roundId }, ctx);
      return {
        ...next,
        pendingRound: {
          roundId: input.roundId,
          gameId: input.gameId,
          stakeMinor,
          returnMinor: input.returnMinor,
          outcomeKey: input.outcomeKey,
          seed: input.seed,
          usedFreeSpin: false,
          startedAt: ctx.now,
          interactive: input.interactive === true,
          maxReturnMinor,
          baseStakeMinor: stakeMinor,
        },
      };
    }

    /**
     * Zusatzeinsatz innerhalb einer laufenden interaktiven Runde (Blackjack: Verdoppeln, Teilen).
     * Er wird als eigene Buchung erfasst, damit die Historie den tatsächlich gesetzten Betrag zeigt
     * und die Kette weiter aufgeht. Der Rahmen der Runde (maxReturnMinor) wächst im selben
     * Verhältnis mit — die UI kann dadurch keinen größeren Rahmen erschleichen, denn der Faktor
     * stammt aus der beim Start deklarierten Obergrenze, nicht aus der Aktion.
     */
    case "RAISE_ROUND_STAKE": {
      const { roundId, additionalMinor, ctx } = action;
      const round = state.pendingRound;
      if (!round || round.roundId !== roundId) return reject(state, "NO_PENDING_ROUND", ctx.now);
      const raiseCheck = checkRaiseAllowed(round, additionalMinor);
      if (!raiseCheck.ok) return reject(state, raiseCheck.code, ctx.now);
      const fundsCheck = checkFundsAvailable(state.wallet, additionalMinor);
      if (!fundsCheck.ok) return reject(state, fundsCheck.code, ctx.now);

      const { fromBonus, fromDemo } = splitStakeAcrossBalances(state.wallet, additionalMinor);
      const wallet: Wallet = {
        ...state.wallet,
        bonusBalanceMinor: state.wallet.bonusBalanceMinor - fromBonus,
        demoBalanceMinor: state.wallet.demoBalanceMinor - fromDemo,
      };
      const next = book(state, wallet, { type: "demo_bet", amountMinor: -additionalMinor, gameId: round.gameId, roundId: round.roundId }, ctx);
      return {
        ...next,
        pendingRound: {
          ...round,
          stakeMinor: round.stakeMinor + additionalMinor,
          maxReturnMinor: computeRaisedMaxReturn(round, additionalMinor),
        },
      };
    }

    case "SETTLE_ROUND": {
      const { roundId, ctx } = action;
      if (!state.pendingRound || state.pendingRound.roundId !== roundId) return reject(state, "NO_PENDING_ROUND", ctx.now);
      return settle(state, ctx, action.returnMinor);
    }

    case "SERVER_WALLET_SYNC": {
      const wallet: Wallet = { ...state.wallet, ...action.wallet };
      return { ...state, wallet };
    }

    default:
      return state;
  }
}
