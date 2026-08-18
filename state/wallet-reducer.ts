import type { CreditsMinor } from "@/types/money";
import type { Transaction, TransactionType } from "@/types/transaction";
import type { Wallet, WalletBalance } from "@/types/wallet";
import { START_BALANCE_MINOR } from "@/lib/constants";
import { availableMinor, checkMaxBalanceAfterCredit, checkRoundNotInFlight, type WalletRejectionCode } from "@/lib/wallet-policy";

/**
 * Wallet-Reducer für die Aktionen, die weiterhin lokalen Zustand verändern: Aufladen, Zurücksetzen,
 * Bonusgutschrift, Hydration und die Anzeige-Übernahme eines serverseitig gemeldeten Saldos. Für
 * diese Aktionen gelten hier — und nur hier — die Geld-Invarianten aus §6:
 *  1. Guthaben nie negativ; Gutschriften über der Obergrenze werden abgelehnt, nicht gekappt.
 *  2. Jede Guthabenänderung erzeugt genau eine Transaktion.
 *  3. balanceAfterMinor entspricht immer dem Guthaben nach dem Vorgang.
 *
 * Rundenstart und -abschluss liefen früher zusätzlich lokal über diesen Reducer
 * (START_ROUND/SETTLE_ROUND/RAISE_ROUND_STAKE) — das ist mit Phase 3b entfallen: alle Runden
 * werden ausschließlich serverseitig aufgelöst und gebucht (server/rounds/*.ts,
 * server/repositories/*.ts). Dort gelten dieselben Invarianten zusätzlich um Idempotenz
 * (ein Rundenstart bucht serverseitig genau einmal, egal wie oft derselbe Idempotenzschlüssel
 * ankommt) und, aus diesem Auftrag ausdrücklich ausgeklammert, Responsible-Gaming-Prüfung.
 * Ein zweiter, lokaler Buchungsweg existiert absichtlich nicht mehr — zwei Pfade zum Buchen von
 * Guthaben wären eine dauerhafte Fehlerquelle. Die Entscheidungsregeln für die verbliebenen
 * Aktionen stehen weiterhin in lib/wallet-policy.ts (rein, ohne React/State) — hier werden nur
 * noch Zustandsübergänge vollzogen und Transaktionen gebucht. Die UI prüft nichts davon selbst;
 * sie zeigt nur lastRejection an.
 */

// Re-Export, damit bestehende Importe aus state/wallet-reducer unverändert funktionieren.
export type { WalletRejectionCode } from "@/lib/wallet-policy";
export { availableMinor } from "@/lib/wallet-policy";

export type WalletRejection = { code: WalletRejectionCode; message: string; at: string };

export type WalletState = {
  hydrated: boolean;
  wallet: Wallet;
  transactions: Transaction[];
  nextSeq: number;
  lastRejection: WalletRejection | null;
};

/** Kontext, den der Provider (nicht die UI) jeder Aktion beilegt. */
export type WalletCtx = {
  userId: string;
  now: string;
  /** true bei aktiver Selbstsperre, Pause oder erreichtem Demo-Limit (aus dem RgContext). */
  rgBlocked: boolean;
};

export type WalletAction =
  | {
      type: "HYDRATE";
      slice: unknown;
      ctx: WalletCtx;
      /**
       * Phase 3b (Auftrag: Guthabenanzeige zeigt durchgängig den Serverstand): der beim Laden
       * server-seitig gelesene Wallet-Stand (state/WalletContext.tsx, app/layout.tsx ⇒
       * server/wallet/wallet-read-model.ts). Wird — falls vorhanden — NACH der lokalen
       * Wiederherstellung über die Saldofelder gelegt: der Server ist die Wahrheit, ein evtl.
       * veralteter LocalStorage-Stand gewinnt nie. `roundInFlight` bleibt unberührt (wie bei
       * SERVER_WALLET_SYNC) — dieser Reducer bucht seit Phase 3b keine Runden mehr, das Feld
       * existiert nur noch, weil `types/wallet.ts::Wallet` serverseitig (server/rounds/*.ts,
       * lib/wallet-policy.ts) als vollständiger Typ wiederverwendet wird und dort nicht entfernt
       * werden darf. Optional, damit bestehende HYDRATE-Aufrufe (Tests, ohne Server-Kontext)
       * unverändert funktionieren.
       */
      serverWallet?: WalletBalance;
    }
  | { type: "TOP_UP"; amountMinor: CreditsMinor; ctx: WalletCtx }
  | { type: "RESET"; ctx: WalletCtx }
  | { type: "GRANT_BONUS"; bonusMinor: CreditsMinor; freeSpins: number; sourceId: string; ctx: WalletCtx }
  | { type: "CLEAR_REJECTION" }
  /**
   * Phase 3a: Guthabenstand nach einer serverseitig aufgelösten Runde
   * (`state/WalletContext.tsx::syncServerWallet`, `components/game/engine/useRound.ts`). Die
   * Buchung selbst (Einsatz, Ergebnis, Ledger) ist zu diesem Zeitpunkt bereits serverseitig
   * abgeschlossen — hier wird NUR die Anzeige nachgeführt, es wird keine weitere Transaktion
   * erzeugt (die liegt bereits im Server-Ledger) und `roundInFlight` bleibt unberührt.
   */
  | { type: "SERVER_WALLET_SYNC"; wallet: WalletBalance };

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
    // roundInFlight wird nie „wahr“ hydriert — es gibt seit Phase 3b keinen lokalen Rundenzustand
    // mehr, der das rechtfertigen würde (siehe Kommentar am WalletAction-Union oben).
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

/**
 * Persistierte Form der Wallet-Scheibe. SCHEMA_VERSION wurde erhöht (lib/constants.ts), als das
 * Feld `pendingRound` hier entfiel — alte LocalStorage-Einträge mit diesem Feld werden dadurch
 * beim nächsten Laden verworfen statt fehlinterpretiert (lib/storage.ts, "unsupported-version").
 */
export function toPersistedWallet(state: WalletState) {
  return {
    wallet: state.wallet,
    transactions: state.transactions,
    nextSeq: state.nextSeq,
  };
}

/**
 * Legt — falls vorhanden — den serverseitig gelesenen Saldo über die Wallet-Salden. Gilt für
 * JEDEN HYDRATE-Ausgang (auch den Defekte-Scheibe-Pfad): ohne diesen Aufruf dort würde ein
 * beschädigter LocalStorage-Eintrag auf das hartkodierte `initialWallet` (1.000,00 Credits)
 * zurückfallen, statt auf den tatsächlichen Serverstand — genau das „Aufblitzen eines falschen
 * Werts", das der Auftrag ausschließt. `roundInFlight` bleibt unverändert (siehe Kommentar am
 * `serverWallet`-Feld oben).
 */
function applyServerWallet(state: WalletState, serverWallet: Extract<WalletAction, { type: "HYDRATE" }>["serverWallet"]): WalletState {
  if (!serverWallet) return state;
  return { ...state, wallet: { ...state.wallet, ...serverWallet } };
}

export function walletReducer(state: WalletState, action: WalletAction): WalletState {
  switch (action.type) {
    case "HYDRATE": {
      const slice = action.slice;
      if (!isRecord(slice)) return applyServerWallet({ ...state, hydrated: true }, action.serverWallet);
      const wallet = parseWallet(slice.wallet);
      const transactions = parseTransactions(slice.transactions);
      if (!wallet || !transactions) return applyServerWallet({ ...state, hydrated: true }, action.serverWallet);
      const maxSeq = transactions.reduce((m, t) => Math.max(m, t.seq), 0);
      const nextSeq = typeof slice.nextSeq === "number" && slice.nextSeq > maxSeq ? slice.nextSeq : maxSeq + 1;
      const next: WalletState = {
        ...state,
        hydrated: true,
        wallet,
        transactions,
        nextSeq,
        lastRejection: null,
      };
      return applyServerWallet(next, action.serverWallet);
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

    case "SERVER_WALLET_SYNC": {
      const wallet: Wallet = { ...state.wallet, ...action.wallet };
      return { ...state, wallet };
    }

    default:
      return state;
  }
}
