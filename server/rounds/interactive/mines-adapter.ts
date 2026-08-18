import type { WalletRejectionCode } from "@/lib/wallet-policy";
// Ausnahme in eslint.config.mjs (server/**-Regel, dieselbe wie engine-resolvers.ts): reiner,
// React-freier Import der UNVERÄNDERTEN Mines-Fachlogik (Auftrag §4). Dieser Adapter fügt nur
// Zustandsableitung, Aktionsprüfung und die Sichtbarkeitsgrenze für den Server hinzu — an
// mines-logic.ts selbst ändert sich nichts.
import {
  MINES_CELLS,
  isMinesCount,
  minePositions,
  minesCountFromBetId,
  minesMultiplier,
  minesReturnMinor,
  type MinesCount,
} from "@/components/game/engine/arcade/mines-logic";

/**
 * Serverseitiger Mines-Adapter (Phase 3b). Schließt die größte Schwachstelle aus Phase 3a: die
 * Minenpositionen entstehen weiterhin rein aus (seed, mines) — wie bisher — werden aber NIE als
 * Ganzes an den Client gesendet, solange die Runde läuft. `minesPublicView()` ist die einzige
 * Stelle, die entscheidet, was der Client sehen darf; jede andere Funktion hier arbeitet mit dem
 * vollständigen, internen Zustand.
 */

export type MinesRoundStatus = "open" | "hit" | "cashedOut" | "cleared";

export type MinesRoundState = {
  mines: MinesCount;
  /** Sicher aufgedeckte Felder, in Aufdeckreihenfolge — niemals ein Minenfeld. */
  revealed: number[];
  status: MinesRoundStatus;
  /** Nur bei status "hit" gesetzt: das Feld, das die Runde beendet hat. */
  hitCell: number | null;
};

export type MinesActionCheck = { ok: true } | { ok: false; code: WalletRejectionCode };

/** Zustand direkt nach dem Rundenstart — noch kein Feld aufgedeckt. */
export function startMinesRoundState(ctx: { seed: number; stakeMinor: number; betKey: string | null }): MinesRoundState {
  const mines = minesCountFromBetId(ctx.betKey ?? undefined);
  return { mines, revealed: [], status: "open", hitCell: null };
}

export function isMinesRoundFinished(state: MinesRoundState): boolean {
  return state.status !== "open";
}

function isValidCellPayload(value: unknown): value is { cell: number } {
  if (typeof value !== "object" || value === null) return false;
  const cell = (value as Record<string, unknown>).cell;
  return typeof cell === "number" && Number.isInteger(cell);
}

/** Validiert NUR das Format der Nutzlast — ob die Aktion im aktuellen Zustand erlaubt ist, prüft checkMinesAction(). */
export function parseMinesPayload(action: string, payload: unknown): { ok: true; value: unknown } | { ok: false } {
  if (action === "reveal") {
    return isValidCellPayload(payload) ? { ok: true, value: { cell: payload.cell } } : { ok: false };
  }
  if (action === "cashOut") return { ok: true, value: {} };
  return { ok: false };
}

/**
 * Prüft eine Aktion gegen den abgeleiteten Zustand — VOR jeder Anwendung. Deckt alle im Auftrag
 * geforderten Ablehnungsfälle ab: Aktion nach Rundenende, doppeltes Aufdecken, Feld außerhalb
 * des Rasters, Auszahlen ohne aufgedecktes Feld.
 */
export function checkMinesAction(state: MinesRoundState, action: string, payload: unknown): MinesActionCheck {
  if (isMinesRoundFinished(state)) return { ok: false, code: "INVALID_STAKE" };
  if (action === "reveal") {
    const parsed = parseMinesPayload("reveal", payload);
    if (!parsed.ok) return { ok: false, code: "INVALID_STAKE" };
    const { cell } = parsed.value as { cell: number };
    if (cell < 0 || cell >= MINES_CELLS) return { ok: false, code: "INVALID_STAKE" };
    if (state.revealed.includes(cell)) return { ok: false, code: "INVALID_STAKE" };
    return { ok: true };
  }
  if (action === "cashOut") {
    if (state.revealed.length === 0) return { ok: false, code: "INVALID_STAKE" };
    return { ok: true };
  }
  return { ok: false, code: "INVALID_STAKE" };
}

/** Mines kennt keinen Zusatzeinsatz während der Runde (anders als Blackjack). */
export function additionalStakeForMinesAction(): number {
  return 0;
}

/**
 * Wendet eine bereits über checkMinesAction() geprüfte Aktion an. Wirft nie — der Aufrufer
 * (server/rounds/round-action-service.ts) ruft checkMinesAction() vorher auf.
 */
export function applyMinesAction(state: MinesRoundState, action: string, payload: unknown, ctx: { seed: number }): MinesRoundState {
  if (action === "reveal") {
    const { cell } = payload as { cell: number };
    const positions = minePositions(ctx.seed, state.mines);
    if (positions.includes(cell)) {
      return { ...state, status: "hit", hitCell: cell };
    }
    const revealed = [...state.revealed, cell];
    const safeCells = MINES_CELLS - state.mines;
    return { ...state, revealed, status: revealed.length === safeCells ? "cleared" : "open" };
  }
  if (action === "cashOut") {
    return { ...state, status: "cashedOut" };
  }
  throw new Error(`Mines: unbekannte Aktion „${action}".`);
}

export type MinesSettlement = { returnMinor: number; outcomeKey: string; outcomeLabel: string; detail: Record<string, unknown> };

/** Endabrechnung — nur aufrufbar, wenn isMinesRoundFinished(state) === true. */
export function settleMinesRound(state: MinesRoundState, stakeMinor: number): MinesSettlement {
  const k = state.revealed.length;
  if (state.status === "hit") {
    return {
      returnMinor: 0,
      outcomeKey: "mine",
      outcomeLabel: `Mine getroffen nach ${k} ${k === 1 ? "Feld" : "Feldern"}`,
      detail: { mines: state.mines, revealed: k, hit: state.hitCell },
    };
  }
  if (state.status === "cashedOut") {
    const returnMinor = minesReturnMinor(stakeMinor, state.mines, k);
    return {
      returnMinor,
      outcomeKey: "cashout",
      outcomeLabel: `Ausgezahlt nach ${k} ${k === 1 ? "Feld" : "Feldern"} · ${minesMultiplier(state.mines, k).toLocaleString("de-DE")}×`,
      detail: { mines: state.mines, revealed: k },
    };
  }
  // "cleared": alle sicheren Felder aufgedeckt — automatischer Höchstauszahlungs-Abschluss.
  const returnMinor = minesReturnMinor(stakeMinor, state.mines, k);
  return {
    returnMinor,
    outcomeKey: "clear",
    outcomeLabel: `Alle ${k} freien Felder aufgedeckt · ${minesMultiplier(state.mines, k).toLocaleString("de-DE")}×`,
    detail: { mines: state.mines, revealed: k },
  };
}

/**
 * Sichtbarkeitsgrenze (Auftrag §3, Kern dieser Phase): Solange die Runde läuft, enthält die
 * Antwort NUR das Ergebnis der bereits aufgedeckten Felder und den daraus folgenden
 * Multiplikator — niemals `positions` oder `hitCell`. Erst wenn `finished === true` (Runde
 * beendet, egal ob durch Treffer, Auszahlen oder vollständiges Aufdecken) dürfen die
 * Minenpositionen mitgeschickt werden; zu diesem Zeitpunkt kann der Client sie nicht mehr
 * ausnutzen, es gibt keine weitere Entscheidung mehr in dieser Runde.
 */
export type MinesPublicViewOpen = {
  mines: MinesCount;
  status: MinesRoundStatus;
  revealedCells: number[];
  revealedCount: number;
  multiplier: number;
  cellsRemaining: number;
};

export type MinesPublicViewFinished = MinesPublicViewOpen & { positions: number[]; hitCell: number | null };

// Überladungen statt eines einzelnen `boolean`-Parameters: nur so kann TypeScript am Aufrufort
// (finished als Literal `true`/`false`) zwischen den beiden Rückgabeformen unterscheiden — sonst
// wäre `positions`/`hitCell` für Aufrufer, die bereits `finished === true` wissen, nicht sichtbar,
// obwohl sie zur Laufzeit vorhanden sind (siehe mines-adapter.test.ts).
export function minesPublicView(state: MinesRoundState, finished: true, ctx: { seed: number }): MinesPublicViewFinished;
export function minesPublicView(state: MinesRoundState, finished: false, ctx: { seed: number }): MinesPublicViewOpen;
export function minesPublicView(state: MinesRoundState, finished: boolean, ctx: { seed: number }): MinesPublicViewOpen | MinesPublicViewFinished {
  const base: MinesPublicViewOpen = {
    mines: state.mines,
    status: state.status,
    revealedCells: state.revealed,
    revealedCount: state.revealed.length,
    multiplier: minesMultiplier(state.mines, state.revealed.length),
    cellsRemaining: MINES_CELLS - state.mines - state.revealed.length,
  };
  if (!finished) return base;
  return { ...base, positions: minePositions(ctx.seed, state.mines), hitCell: state.hitCell };
}

export { isMinesCount };
