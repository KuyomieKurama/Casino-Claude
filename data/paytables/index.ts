import type { Paytable } from "@/types/game-round";
import { slotPaytables } from "./slots";
import { roulettePaytables } from "./roulette";
import { baccaratPaytables } from "./baccarat";
import { videoPokerPaytables } from "./videopoker";
import { arcadePaytables } from "./arcade";

/**
 * Zentrale Sammlung aller dokumentierten Auszahlungstabellen (Regel 6).
 * Jede Engine-Familie liefert ihre eigene Datei; hier werden sie nur zusammengeführt.
 *
 * Schlüssel: `gameId` für Spiele mit genau einer Tabelle, `gameId::betId` für Spiele,
 * deren Erwartungswert von der gewählten Wette abhängt (Roulette, Baccarat, Dice …).
 *
 * Interaktive Spiele ohne feste Tabelle (Blackjack, Mines) stehen bewusst NICHT hier —
 * sie zeigen deshalb auch keinen RTP-Wert an.
 */
export const paytables: readonly Paytable[] = [
  ...slotPaytables,
  ...roulettePaytables,
  ...baccaratPaytables,
  ...videoPokerPaytables,
  ...arcadePaytables,
];

export function findPaytable(gameId: string, betId?: string): Paytable | undefined {
  if (betId) {
    const specific = paytables.find((p) => p.gameId === `${gameId}::${betId}`);
    if (specific) return specific;
  }
  return paytables.find((p) => p.gameId === gameId);
}

/** Alle Tabellen eines Spiels (eine je Wettoption, oder genau eine). */
export function paytablesOf(gameId: string): Paytable[] {
  return paytables.filter((p) => p.gameId === gameId || p.gameId.startsWith(`${gameId}::`));
}

/** Die Wett-ID aus einem zusammengesetzten Tabellenschlüssel. */
export function betIdOf(paytableId: string): string | undefined {
  const idx = paytableId.indexOf("::");
  return idx === -1 ? undefined : paytableId.slice(idx + 2);
}
