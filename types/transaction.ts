import type { CreditsMinor } from "./money";

export type TransactionType =
  | "credit"
  | "bet"
  | "win"
  | "bonus_grant"
  | "free_spin"
  | "reset";

export type Transaction = {
  id: string;
  /** Monoton steigend, garantiert die Reihenfolge unabhängig vom Zeitstempel. */
  seq: number;
  userId: string;
  type: TransactionType;
  /** Einsatz negativ, Gutschrift positiv. */
  amountMinor: CreditsMinor;
  balanceAfterMinor: CreditsMinor;
  gameId?: string;
  /** Verbindet Einsatz und Ergebnis derselben Runde. */
  roundId?: string;
  createdAt: string;
};
