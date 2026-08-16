"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from "react";
import type { Wallet } from "@/types/wallet";
import type { Transaction } from "@/types/transaction";
import type { CreditsMinor } from "@/types/money";
import { writeSlice } from "@/lib/storage";
import { nowIso } from "@/lib/ids";
import { sampleTransactions } from "@/data/mock-history";
import { usePersistence } from "./PersistenceContext";
import { useSession } from "./SessionContext";
import { useRg } from "./RgContext";
import {
  createInitialWalletState,
  toPersistedWallet,
  walletReducer,
  type StartRoundInput,
  type WalletAction,
  type WalletCtx,
  type WalletRejection,
  type WalletState,
} from "./wallet-reducer";

type WalletValue = {
  state: WalletState;
  hydrated: boolean;
  wallet: Wallet;
  transactions: readonly Transaction[];
  lastRejection: WalletRejection | null;
  /** Rückgabe: null = angenommen, sonst die Ablehnung des Reducers. */
  topUp: (amountMinor: CreditsMinor) => WalletRejection | null;
  reset: () => WalletRejection | null;
  startRound: (input: StartRoundInput) => WalletRejection | null;
  /** `returnMinor` nur bei interaktiven Runden; der Reducer prüft die deklarierte Obergrenze. */
  settleRound: (roundId: string, returnMinor?: CreditsMinor) => WalletRejection | null;
  /** Zusatzeinsatz in einer laufenden interaktiven Runde (Verdoppeln, Teilen). */
  raiseRoundStake: (roundId: string, additionalMinor: CreditsMinor) => WalletRejection | null;
  grantBonus: (input: { bonusMinor: CreditsMinor; freeSpins: number; sourceId: string }) => WalletRejection | null;
  clearRejection: () => void;
};

const WalletContext = createContext<WalletValue | null>(null);

/**
 * Der Provider legt jeder Aktion den Kontext bei (Nutzer, Zeit, RG-Sperre) — die UI kann
 * diese Werte nicht beeinflussen. Der Reducer entscheidet, die UI zeigt nur an.
 */
export function WalletProvider({ children }: { children: ReactNode }) {
  const persistence = usePersistence();
  const { user } = useSession();
  const { getStatus, hydrated: rgHydrated } = useRg();
  const [state, dispatch] = useReducer(walletReducer, sampleTransactions, createInitialWalletState);
  const stateRef = useRef(state);
  // Bei jedem Render gilt der echte React-Zustand. Zwischen zwei Rendern schreibt `run()` den
  // Zwischenstand fort (siehe dort) — nur dann kann er überhaupt vom Render abweichen.
  stateRef.current = state;

  const makeCtx = useCallback(
    (): WalletCtx => ({ userId: user?.id ?? "guest", now: nowIso(), rgBlocked: getStatus().blocked }),
    [user?.id, getStatus],
  );

  // Erst hydrieren, wenn auch RG hydriert ist — sonst könnte eine offene Runde mit falschem Kontext abgeschlossen werden.
  useEffect(() => {
    if (persistence.hydrated && rgHydrated && !state.hydrated) {
      dispatch({ type: "HYDRATE", slice: persistence.slices.wallet, ctx: makeCtx() });
    }
  }, [persistence.hydrated, persistence.slices.wallet, rgHydrated, state.hydrated, makeCtx]);

  useEffect(() => {
    if (state.hydrated) writeSlice("wallet", toPersistedWallet(state));
  }, [state]);

  /**
   * Führt den Reducer auf dem aktuellen Stand aus, um die Antwort sofort zu kennen, und dispatcht
   * dieselbe Aktion.
   *
   * Entscheidend ist die Zeile `stateRef.current = after`: React verarbeitet Dispatches erst beim
   * nächsten Rendern. Ohne die Fortschreibung sähen mehrere Aufrufe im selben Task (hektischer
   * Doppelklick) alle denselben veralteten Zustand — der zweite Start würde hier fälschlich als
   * angenommen gemeldet, während der echte Reducer ihn ablehnt. Die Oberfläche liefe dann auf eine
   * Runde zu, die es nie gab, und bliebe hängen. Der Reducer ist rein, also führt dieselbe
   * Aktionsfolge hier und in React zum selben Ergebnis.
   */
  const run = useCallback((action: WalletAction): WalletRejection | null => {
    const before = stateRef.current;
    const after = walletReducer(before, action);
    stateRef.current = after;
    dispatch(action);
    if (after.lastRejection && after.lastRejection !== before.lastRejection) return after.lastRejection;
    return null;
  }, []);

  const topUp = useCallback((amountMinor: CreditsMinor) => run({ type: "TOP_UP", amountMinor, ctx: makeCtx() }), [run, makeCtx]);
  const reset = useCallback(() => run({ type: "RESET", ctx: makeCtx() }), [run, makeCtx]);
  const startRound = useCallback((input: StartRoundInput) => run({ type: "START_ROUND", input, ctx: makeCtx() }), [run, makeCtx]);
  const settleRound = useCallback(
    (roundId: string, returnMinor?: CreditsMinor) => run({ type: "SETTLE_ROUND", roundId, ctx: makeCtx(), ...(returnMinor === undefined ? {} : { returnMinor }) }),
    [run, makeCtx],
  );
  const raiseRoundStake = useCallback(
    (roundId: string, additionalMinor: CreditsMinor) => run({ type: "RAISE_ROUND_STAKE", roundId, additionalMinor, ctx: makeCtx() }),
    [run, makeCtx],
  );
  const grantBonus = useCallback(
    (input: { bonusMinor: CreditsMinor; freeSpins: number; sourceId: string }) => run({ type: "GRANT_BONUS", ...input, ctx: makeCtx() }),
    [run, makeCtx],
  );
  const clearRejection = useCallback(() => dispatch({ type: "CLEAR_REJECTION" }), []);

  const value = useMemo<WalletValue>(
    () => ({
      state,
      hydrated: state.hydrated,
      wallet: state.wallet,
      transactions: state.transactions,
      lastRejection: state.lastRejection,
      topUp,
      reset,
      startRound,
      settleRound,
      raiseRoundStake,
      grantBonus,
      clearRejection,
    }),
    [state, topUp, reset, startRound, settleRound, raiseRoundStake, grantBonus, clearRejection],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletValue {
  const v = useContext(WalletContext);
  if (!v) throw new Error("useWallet muss innerhalb von <WalletProvider> verwendet werden.");
  return v;
}
