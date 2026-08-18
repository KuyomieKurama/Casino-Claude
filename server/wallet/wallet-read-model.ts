import type { AppDatabase } from "@/server/db/types";
import { findWallet } from "@/server/repositories/wallet-repository";
import { START_BALANCE_MINOR } from "@/lib/constants";
import type { CreditsMinor } from "@/types/money";

/**
 * Lesepfad für den aktuellen Wallet-Stand (Auftrag §1). Bewusst als reine Funktion mit `db` und
 * `userId` als Parameter (kein eigener Verbindungsaufbau, kein `import "server-only"`) — dasselbe
 * Muster wie server/catalog/read-model.ts, läuft dadurch unverändert gegen PGlite in Tests und
 * gegen die echte Verbindung in app/layout.tsx. Der Layer-Schutz kommt über ESLint
 * (components/**​/state/** dürfen nicht aus @/server/* importieren), nicht über einen
 * Laufzeit-Guard.
 *
 * Aufrufer MÜSSEN `userId` aus der geprüften Sitzung (server/auth/guards.ts::getSession()) oder
 * `null` (keine Sitzung) übergeben — niemals aus einem Client-Wert. Diese Funktion selbst nimmt
 * keine Autorisierungsentscheidung vor, sie liest strikt nur das Wallet der übergebenen ID.
 */
export interface WalletBalanceSnapshot {
  demoBalanceMinor: CreditsMinor;
  bonusBalanceMinor: CreditsMinor;
  freeSpins: number;
}

/**
 * Standardwert für „es gibt noch kein Wallet" — sowohl für Gäste ohne Sitzung (`userId === null`)
 * als auch für angemeldete Nutzer, die noch nie eine Runde gestartet haben (`findWallet` liefert
 * `null`, weil server/rounds/round-service.ts das Wallet erst beim ersten Rundenstart über
 * `insertWalletIfMissing` anlegt). Kein geratener Betrag: es ist exakt der Betrag, den
 * `insertWalletIfMissing` beim ersten Rundenstart bucht — dieselbe Konstante, dieselbe Quelle.
 * Kein Fehler, kein Sonderfall in der Oberfläche.
 */
function defaultWalletBalance(): WalletBalanceSnapshot {
  return { demoBalanceMinor: START_BALANCE_MINOR, bonusBalanceMinor: 0, freeSpins: 0 };
}

export async function resolveWalletBalance(db: AppDatabase, userId: string | null): Promise<WalletBalanceSnapshot> {
  if (userId === null) return defaultWalletBalance();
  const record = await findWallet(db, userId);
  if (!record) return defaultWalletBalance();
  return { demoBalanceMinor: record.demoBalanceMinor, bonusBalanceMinor: record.bonusBalanceMinor, freeSpins: record.freeSpins };
}
