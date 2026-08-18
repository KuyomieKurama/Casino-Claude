import type { CreditsMinor } from "./money";

export type Wallet = {
  demoBalanceMinor: CreditsMinor;
  bonusBalanceMinor: CreditsMinor;
  freeSpins: number;
  /** Doppelklick- und Race-Guard: solange true, wird keine zweite Runde angenommen. */
  roundInFlight: boolean;
};

/**
 * Nur die Saldofelder, ohne `roundInFlight` (rein lokaler Client-Zustand, den der Server nicht
 * kennt). Form des serverseitig gelesenen Wallet-Stands (server/wallet/wallet-read-model.ts),
 * der von app/layout.tsx über state/AppProviders.tsx bis state/WalletContext.tsx durchgereicht
 * wird — dort als eigenständiger Typ definiert, damit state/** nicht aus @/server/* importieren
 * muss (Schichtregel, CLAUDE.md).
 */
export type WalletBalance = Pick<Wallet, "demoBalanceMinor" | "bonusBalanceMinor" | "freeSpins">;
