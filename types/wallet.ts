import type { CreditsMinor } from "./money";

export type Wallet = {
  demoBalanceMinor: CreditsMinor;
  bonusBalanceMinor: CreditsMinor;
  freeSpins: number;
  /** Doppelklick- und Race-Guard: solange true, wird keine zweite Runde angenommen. */
  roundInFlight: boolean;
};
