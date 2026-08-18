import type { CreditsMinor } from "@/types/money";
import type { Wallet } from "@/types/wallet";
import { MAX_BALANCE_MINOR } from "@/lib/constants";

/**
 * Reine Entscheidungsregeln des Wallets (Konzept §6), losgelöst von React, Zustand und Storage.
 * `state/wallet-reducer.ts` bucht Transaktionen und verwaltet `WalletState` — hier steht nur noch
 * die Frage „ist dieser Vorgang erlaubt, und falls nicht, warum". Das erlaubt es, dieselben Regeln
 * später (z. B. serverseitig) wiederzuverwenden, ohne den Reducer mitzuziehen.
 */

export type WalletRejectionCode =
  | "INSUFFICIENT_FUNDS"
  | "ROUND_IN_FLIGHT"
  | "RG_BLOCKED"
  | "INVALID_STAKE"
  | "NO_PENDING_ROUND"
  | "MAX_BALANCE"
  | "NO_FREE_SPINS"
  | "RETURN_OUT_OF_RANGE"
  | "RAISE_NOT_ALLOWED"
  /**
   * Phase 3a (serverseitige, nicht-interaktive Runden): der Server war nicht erreichbar, hat
   * unerwartet geantwortet, oder eine Antwort ließ sich nicht auflösen. Kein Rundenergebnis und
   * keine Buchung — anders als die übrigen Codes hier ist das kein Fachentscheid, sondern ein
   * Transportfehler. Gehört trotzdem in dieselbe Union, damit `useRound.ts` einheitlich mit
   * `WalletRejection` arbeiten kann, egal ob die Ablehnung vom lokalen Reducer oder von der
   * Server-Antwort stammt.
   */
  | "SERVER_ERROR";

/** Discriminated Union statt Exceptions — der Aufrufer kann den Ablehnungsgrund nicht vergessen. */
export type PolicyResult<T> = { ok: true; value: T } | { ok: false; code: WalletRejectionCode };

function ok<T>(value: T): PolicyResult<T> {
  return { ok: true, value };
}

function fail<T>(code: WalletRejectionCode): PolicyResult<T> {
  return { ok: false, code };
}

/** Verfügbares Guthaben für Einsätze: Demo- plus Bonusguthaben (additiv, ohne Bedingungen). */
export function availableMinor(wallet: Wallet): CreditsMinor {
  return wallet.demoBalanceMinor + wallet.bonusBalanceMinor;
}

/** Responsible-Gaming-Sperre (Pause, Limit, Selbstsperre) blockiert jede einsatzbezogene Aktion. */
export function checkRgNotBlocked(rgBlocked: boolean): PolicyResult<void> {
  if (rgBlocked) return fail("RG_BLOCKED");
  return ok(undefined);
}

/**
 * Doppelklick- und Race-Guard: Solange bereits eine Runde offen ist, wird keine zweite
 * angenommen — weder ein neuer Rundenstart noch ein Zurücksetzen des Wallets.
 */
export function checkRoundNotInFlight(roundInFlight: boolean): PolicyResult<void> {
  if (roundInFlight) return fail("ROUND_IN_FLIGHT");
  return ok(undefined);
}

/** Einsatz muss ganzzahlig, positiv und innerhalb der vom Spiel deklarierten Grenzen liegen. */
export function checkStakeRange(
  stakeMinor: CreditsMinor,
  minStakeMinor: CreditsMinor,
  maxStakeMinor: CreditsMinor,
): PolicyResult<CreditsMinor> {
  if (!Number.isInteger(stakeMinor) || stakeMinor < minStakeMinor || stakeMinor > maxStakeMinor || stakeMinor <= 0) {
    return fail("INVALID_STAKE");
  }
  return ok(stakeMinor);
}

/**
 * Bestimmt die Obergrenze, bis zu der eine interaktive Runde (Blackjack, Mines) am Ende
 * auszahlen darf. Nicht-interaktive Runden zahlen immer exakt `returnMinor` — ihre Obergrenze
 * ist also trivial gleich dem Ergebnis und wird nie geprüft. Interaktive Runden MÜSSEN vorab
 * eine gültige, mindestens ebenso hohe Obergrenze deklarieren; sonst könnte die UI später einen
 * beliebigen Betrag erfinden.
 */
export function resolveRoundMaxReturn(
  interactive: boolean,
  returnMinor: CreditsMinor,
  maxReturnMinorInput: CreditsMinor | undefined,
): PolicyResult<CreditsMinor> {
  const maxReturnMinor = interactive ? (maxReturnMinorInput ?? -1) : returnMinor;
  if (interactive && (!Number.isInteger(maxReturnMinor) || maxReturnMinor < returnMinor)) {
    return fail("RETURN_OUT_OF_RANGE");
  }
  return ok(maxReturnMinor);
}

/** Freirunden kosten kein Guthaben, sind aber gezählt — ohne Vorrat kein Start. */
export function checkFreeSpinAvailable(freeSpins: number): PolicyResult<void> {
  if (freeSpins <= 0) return fail("NO_FREE_SPINS");
  return ok(undefined);
}

/** Verfügbares Guthaben (Demo- plus Bonusanteil) muss den angeforderten Betrag decken. */
export function checkFundsAvailable(wallet: Wallet, amountMinor: CreditsMinor): PolicyResult<void> {
  if (availableMinor(wallet) < amountMinor) return fail("INSUFFICIENT_FUNDS");
  return ok(undefined);
}

/**
 * Teilt einen Betrag auf Bonus- und Demoguthaben auf: Bonusguthaben wird zuerst verbraucht,
 * der Rest kommt aus dem Demoguthaben. Der Aufrufer muss vorher mit `checkFundsAvailable`
 * sichergestellt haben, dass die Summe reicht — hier wird nicht mehr geprüft, nur aufgeteilt.
 */
export function splitStakeAcrossBalances(
  wallet: Wallet,
  amountMinor: CreditsMinor,
): { fromBonus: CreditsMinor; fromDemo: CreditsMinor } {
  const fromBonus = Math.min(wallet.bonusBalanceMinor, amountMinor);
  const fromDemo = amountMinor - fromBonus;
  return { fromBonus, fromDemo };
}

/**
 * Prüft ein beim Abschluss abweichend gemeldetes Ergebnis (nur interaktive Runden dürfen das):
 * ganzzahlig, nicht negativ, höchstens die beim Start deklarierte Obergrenze. Damit kann die UI
 * kein Ergebnis erfinden, das über dem beim Rundenstart zugesagten Rahmen liegt.
 */
export function checkSettleReturnOverride(
  round: { interactive: boolean; maxReturnMinor: CreditsMinor },
  override: CreditsMinor,
): PolicyResult<CreditsMinor> {
  if (!round.interactive) return fail("RETURN_OUT_OF_RANGE");
  if (!Number.isInteger(override) || override < 0 || override > round.maxReturnMinor) {
    return fail("RETURN_OUT_OF_RANGE");
  }
  return ok(override);
}

/**
 * Zusatzeinsatz innerhalb einer laufenden interaktiven Runde (Verdoppeln, Teilen). Erlaubt nur
 * bei interaktiven Runden ohne Freirunden-Ursprung, ganzzahlig und positiv, und höchstens bis
 * zum Vierfachen des ursprünglichen Grundeinsatzes (Teilen plus Verdoppeln auf beiden Händen).
 */
export function checkRaiseAllowed(
  round: { interactive: boolean; usedFreeSpin: boolean; stakeMinor: CreditsMinor; baseStakeMinor: CreditsMinor },
  additionalMinor: CreditsMinor,
): PolicyResult<CreditsMinor> {
  if (!round.interactive) return fail("RAISE_NOT_ALLOWED");
  if (!Number.isInteger(additionalMinor) || additionalMinor <= 0) return fail("INVALID_STAKE");
  if (round.usedFreeSpin) return fail("RAISE_NOT_ALLOWED");
  if (round.stakeMinor + additionalMinor > round.baseStakeMinor * 4) return fail("RAISE_NOT_ALLOWED");
  return ok(additionalMinor);
}

/**
 * Der Rahmen der Runde (`maxReturnMinor`) wächst im selben Verhältnis wie der Einsatz mit — die
 * UI kann dadurch keinen größeren Rahmen erschleichen, denn der Faktor stammt aus dem tatsächlich
 * gebuchten Zusatzeinsatz, nicht aus einem frei wählbaren Wert.
 */
export function computeRaisedMaxReturn(
  round: { stakeMinor: CreditsMinor; maxReturnMinor: CreditsMinor },
  additionalMinor: CreditsMinor,
): CreditsMinor {
  const factor = (round.stakeMinor + additionalMinor) / round.stakeMinor;
  return Math.round(round.maxReturnMinor * factor);
}

/** Obergrenze für das Demo-Guthaben bei Gutschriften (Aufladen) — Anzeige und Formatierung bleiben stabil. */
export function checkMaxBalanceAfterCredit(
  currentDemoBalanceMinor: CreditsMinor,
  incomingMinor: CreditsMinor,
): PolicyResult<CreditsMinor> {
  if (currentDemoBalanceMinor + incomingMinor > MAX_BALANCE_MINOR) return fail("MAX_BALANCE");
  return ok(incomingMinor);
}
