import type { CreditsMinor } from "./money";
import type { Game } from "./game";
import type { RoundStatus, Paytable } from "./game-round";

/**
 * Gemeinsame Schnittstelle aller Spiel-Engines.
 *
 * Regeln, die für JEDE Engine gelten (§6, Regel 6 und 9):
 *  - Das Ergebnis entsteht ausschließlich aus einer dokumentierten Auszahlungstabelle
 *    und einem gesäten PRNG (lib/rng). Kein Math.random() in der Spiellogik.
 *  - Kein Zustand zwischen Runden.
 *  - Wird ein rtpDemo angezeigt, ist er der Erwartungswert der Tabelle — geprüft durch Tests.
 *  - Beträge sind ganzzahlige Hundertstel (CreditsMinor), nie float.
 */

/** Eine Wettoption (Roulette-Feld, Baccarat-Seite, Dice-Richtung …). */
export type BetOption = {
  id: string;
  label: string;
  /** Kurze, sachliche Erklärung — keine Strategieempfehlung, keine Gewinnversprechen. */
  hint?: string;
};

/** Ergebnis einer aufgelösten Runde. */
export type EngineOutcome = {
  outcomeKey: string;
  outcomeLabel: string;
  returnMinor: CreditsMinor;
  /** Obergrenze der Rückgabe für interaktive Runden (Blackjack, Mines). */
  maxReturnMinor?: CreditsMinor;
  /** Engine-spezifische Daten für die Darstellung (JSON-serialisierbar). */
  detail?: Record<string, unknown>;
};

export type EngineResolveInput = {
  stakeMinor: CreditsMinor;
  seed: number;
  /** Gewählte Wettoption, falls die Engine welche anbietet. */
  betId?: string;
};

/** Fachlogik einer Engine — rein, ohne React, ohne DOM, vollständig testbar. */
export type GameEngineLogic = {
  id: string;
  /** Wettoptionen; leer, wenn die Engine keine Auswahl kennt (klassischer Slot). */
  betOptions: (game: Game) => readonly BetOption[];
  /** Auszahlungstabelle je Wettoption — Grundlage für RTP-Anzeige und Tests. */
  paytable: (game: Game, betId?: string) => Paytable | undefined;
  /** Löst eine Runde auf. Gleicher Seed + gleiche Eingabe ⇒ gleiches Ergebnis. */
  resolve: (game: Game, input: EngineResolveInput) => EngineOutcome;
  /** true, wenn das Ergebnis erst durch Spielerentscheidungen feststeht. */
  interactive?: boolean;
};

/** Props, die jede Engine-Oberfläche erhält. */
export type GameEngineViewProps = {
  game: Game;
  /** Simuliert einen Ladefehler (Demonstration des Fehlerzustands). */
  simulateLoadError?: boolean;
  onStatusChange?: (status: RoundStatus) => void;
};

export type { RoundStatus };
