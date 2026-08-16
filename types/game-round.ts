import type { CreditsMinor } from "./money";

export type RoundStatus =
  | "idle"
  | "loading"
  | "ready"
  | "playing"
  | "paused"
  | "finished"
  | "error";

export type RoundOutcome = {
  roundId: string;
  gameId: string;
  stakeMinor: CreditsMinor;
  /** Rückgabe, nicht „Gewinn“. */
  returnMinor: CreditsMinor;
  /** returnMinor − stakeMinor. Das ist die angezeigte Zahl (netto, Vorentscheidung E5). */
  netMinor: CreditsMinor;
  /** Verweis in die dokumentierte Auszahlungstabelle. */
  outcomeKey: string;
  /** Macht die Runde reproduzierbar. */
  seed: number;
};

/** Eine Ergebnisklasse der dokumentierten Auszahlungstabelle. */
export type PaytableEntry = {
  key: string;
  label: string;
  multiplier: number;
  probability: number;
};

export type Paytable = {
  /** `gameId` bei genau einer Tabelle, `gameId::betId` bei einer Tabelle je Wettoption. */
  gameId: string;
  /** Klartextname der Wettoption für die Anzeige (z. B. „Rot"). Optional. */
  label?: string;
  entries: PaytableEntry[];
};
