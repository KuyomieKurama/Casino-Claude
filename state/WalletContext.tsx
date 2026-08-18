"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from "react";
import type { Wallet, WalletBalance } from "@/types/wallet";
import type { Transaction } from "@/types/transaction";
import type { CreditsMinor } from "@/types/money";
import { writeSlice } from "@/lib/storage";
import { nowIso } from "@/lib/ids";
import { usePersistence } from "./PersistenceContext";
import { useSession } from "./SessionContext";
import { useRg } from "./RgContext";
import {
  createInitialWalletState,
  toPersistedWallet,
  walletReducer,
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
  grantBonus: (input: { bonusMinor: CreditsMinor; freeSpins: number; sourceId: string }) => WalletRejection | null;
  clearRejection: () => void;
  /**
   * Phase 3a: trägt den vom Server gemeldeten Guthabenstand nach einer serverseitig aufgelösten,
   * nicht-interaktiven Runde in die Anzeige ein (components/game/engine/useRound.ts). Bucht keine
   * eigene Transaktion — die liegt bereits im Server-Ledger, dies ist reiner Anzeige-Abgleich.
   */
  syncServerWallet: (wallet: { demoBalanceMinor: CreditsMinor; bonusBalanceMinor: CreditsMinor; freeSpins: number }) => void;
};

const WalletContext = createContext<WalletValue | null>(null);

export type WalletProviderProps = {
  children: ReactNode;
  /**
   * Serverseitig gelesener Wallet-Stand (app/layout.tsx ⇒ server/wallet/wallet-read-model.ts),
   * beim allerersten Render bereits bekannt — kein Nachladen, kein zweiter Request. Ohne Prop
   * (z. B. bestehende Komponententests, die nur `<AppProviders>` ohne Server-Kontext brauchen)
   * verhält sich der Provider wie vor dieser Änderung: hartkodierter Default plus LocalStorage.
   */
  initialWallet?: WalletBalance;
};

/**
 * Der Provider legt jeder Aktion den Kontext bei (Nutzer, Zeit, RG-Sperre) — die UI kann
 * diese Werte nicht beeinflussen. Der Reducer entscheidet, die UI zeigt nur an.
 */
export function WalletProvider({ children, initialWallet }: WalletProviderProps) {
  const persistence = usePersistence();
  const { user } = useSession();
  const { getStatus, hydrated: rgHydrated } = useRg();
  // Kein sampleTransactions-Seed mehr (Auftrag §2): Wallet-Seite und Historie lesen inzwischen
  // aus dem Server-Ledger (app/(user)/wallet, app/(user)/history), nicht mehr aus
  // state.transactions — Beispieldaten dürften dort sonst als echte Buchungen erscheinen.
  // state.transactions protokolliert seit Phase 3b nur noch TOP_UP/RESET/GRANT_BONUS (Rundenbuchungen
  // laufen ausschließlich serverseitig, siehe state/wallet-reducer.ts), startet für echte Nutzer leer.
  const [state, dispatch] = useReducer(walletReducer, undefined, createInitialWalletState);
  const stateRef = useRef(state);
  // Bei jedem Render gilt der echte React-Zustand. Zwischen zwei Rendern schreibt `run()` den
  // Zwischenstand fort (siehe dort) — nur dann kann er überhaupt vom Render abweichen.
  stateRef.current = state;

  const makeCtx = useCallback(
    (): WalletCtx => ({ userId: user?.id ?? "guest", now: nowIso(), rgBlocked: getStatus().blocked }),
    [user?.id, getStatus],
  );

  // Erst hydrieren, wenn auch RG hydriert ist — makeCtx() liest getStatus().blocked, das soll beim
  // Hydrieren bereits den echten Stand tragen, nicht den RG-Initialwert.
  // `serverWallet: initialWallet` sorgt dafür, dass der Saldo NACH der lokalen Wiederherstellung
  // immer auf den beim Laden gelesenen Serverstand korrigiert wird (state/wallet-reducer.ts::
  // applyServerWallet) — ein wiederkehrender Nutzer sieht dadurch nie einen veralteten Wert aus
  // einem alten LocalStorage-Stand, sondern spätestens ab hydrated=true den echten Saldo.
  useEffect(() => {
    if (persistence.hydrated && rgHydrated && !state.hydrated) {
      dispatch({ type: "HYDRATE", slice: persistence.slices.wallet, ctx: makeCtx(), ...(initialWallet ? { serverWallet: initialWallet } : {}) });
    }
  }, [persistence.hydrated, persistence.slices.wallet, rgHydrated, state.hydrated, makeCtx, initialWallet]);

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
  const grantBonus = useCallback(
    (input: { bonusMinor: CreditsMinor; freeSpins: number; sourceId: string }) => run({ type: "GRANT_BONUS", ...input, ctx: makeCtx() }),
    [run, makeCtx],
  );
  const clearRejection = useCallback(() => dispatch({ type: "CLEAR_REJECTION" }), []);
  const syncServerWallet = useCallback(
    (walletSnapshot: { demoBalanceMinor: CreditsMinor; bonusBalanceMinor: CreditsMinor; freeSpins: number }) => {
      const action: WalletAction = { type: "SERVER_WALLET_SYNC", wallet: walletSnapshot };
      stateRef.current = walletReducer(stateRef.current, action);
      dispatch(action);
    },
    [],
  );

  const value = useMemo<WalletValue>(
    () => ({
      state,
      hydrated: state.hydrated,
      wallet: state.wallet,
      transactions: state.transactions,
      lastRejection: state.lastRejection,
      topUp,
      reset,
      grantBonus,
      clearRejection,
      syncServerWallet,
    }),
    [state, topUp, reset, grantBonus, clearRejection, syncServerWallet],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletValue {
  const v = useContext(WalletContext);
  if (!v) throw new Error("useWallet muss innerhalb von <WalletProvider> verwendet werden.");
  return v;
}
