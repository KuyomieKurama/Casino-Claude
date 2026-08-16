import type { BetOption, EngineOutcome } from "@/types/engine";
import type { PaytableEntry } from "@/types/game-round";
import { mulberry32 } from "@/lib/rng";
import {
  DICE_BETS,
  DICE_DEFAULT_BET_ID,
  DICE_MAX_ROLL,
  DICE_MIN_ROLL,
  findDiceBet,
  type DiceBet,
} from "@/data/paytables/arcade";

/**
 * Dice Demo — Fachlogik, rein und ohne React.
 *
 * Ein Wurf je Runde, ganze Zahlen 1 … 100 (dokumentierte Wahl, siehe data/paytables/arcade.ts).
 * Der Wurf kommt aus dem gesäten PRNG; Zielwert und Richtung wählt die spielende Person vorher.
 * Auszahlung = 0,97 / Trefferwahrscheinlichkeit, also 3 % Hausvorteil auf jeder Stufe.
 */

export { DICE_BETS, DICE_DEFAULT_BET_ID, findDiceBet };
export type { DiceBet };

/** Gleichverteilt auf 1 … 100. */
export function rollDice(seed: number): number {
  const u = mulberry32(seed)();
  const roll = DICE_MIN_ROLL + Math.floor(u * (DICE_MAX_ROLL - DICE_MIN_ROLL + 1));
  return Math.min(DICE_MAX_ROLL, roll);
}

export function isDiceWin(bet: DiceBet, roll: number): boolean {
  return bet.direction === "under" ? roll < bet.target : roll > bet.target;
}

export type DiceRound = {
  bet: DiceBet;
  roll: number;
  win: boolean;
  multiplier: number;
  returnMinor: number;
};

export function resolveDiceRound(stakeMinor: number, seed: number, betId: string | undefined): DiceRound {
  const bet = findDiceBet(betId) ?? findDiceBet(DICE_DEFAULT_BET_ID);
  if (!bet) throw new Error("Dice: keine gültige Wettstufe gefunden.");
  const roll = rollDice(seed);
  const win = isDiceWin(bet, roll);
  const multiplier = win ? bet.multiplier : 0;
  return { bet, roll, win, multiplier, returnMinor: Math.max(0, Math.round(stakeMinor * multiplier)) };
}

export function resolveDice(stakeMinor: number, seed: number, betId: string | undefined): EngineOutcome {
  const round = resolveDiceRound(stakeMinor, seed, betId);
  return {
    outcomeKey: round.win ? "win" : "none",
    outcomeLabel: round.win ? `Treffer — Wurf ${round.roll}` : `Kein Treffer — Wurf ${round.roll}`,
    returnMinor: round.returnMinor,
    detail: { roll: round.roll, betId: round.bet.id, win: round.win },
  };
}

/** Wettoptionen für die Oberfläche — sachliche Beschreibung, keine Strategieempfehlung. */
export function diceBetOptions(): BetOption[] {
  return DICE_BETS.map((bet) => ({
    id: bet.id,
    label: bet.label,
    hint: `Trefferchance ${Math.round(bet.winChance * 100)} %, Auszahlung ${bet.multiplier}×`,
  }));
}

/** Ergebniszeile der Tabelle zur gewählten Wette — für die Anzeige der Staffel. */
export function diceEntries(bet: DiceBet): PaytableEntry[] {
  return [
    { key: "win", label: `Treffer (${Math.round(bet.winChance * 100)} %)`, multiplier: bet.multiplier, probability: bet.winChance },
    { key: "none", label: "Kein Treffer", multiplier: 0, probability: 1 - bet.winChance },
  ];
}

export function parseDiceDetail(detail: Record<string, unknown> | undefined): { roll: number; betId: string; win: boolean } | null {
  if (!detail) return null;
  const { roll, betId, win } = detail;
  if (typeof roll !== "number" || typeof betId !== "string" || typeof win !== "boolean") return null;
  return { roll, betId, win };
}
