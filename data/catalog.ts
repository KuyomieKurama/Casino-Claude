import type { Game } from "@/types/game";
import { games as baseGames } from "./games";
import { paytablesOf } from "./paytables";
import { rtpOf } from "@/lib/paytable";

/**
 * Einzige Quelle der Spiele für die Anwendung.
 *
 * `rtpDemo` wird hier NICHT von Hand gepflegt, sondern aus der dokumentierten Auszahlungstabelle
 * berechnet (Regel 6: ausgewiesener RTP = Erwartungswert der Tabelle). Dadurch kann der
 * angezeigte Wert gar nicht von der Simulation abweichen.
 *
 * Sonderfall mehrerer Tabellen je Spiel (Roulette, Baccarat, Dice): Nur wenn alle Wettoptionen
 * denselben Erwartungswert haben, gibt es einen Spiel-RTP. Unterscheiden sie sich, bleibt
 * `rtpDemo` bewusst leer — die Detailseite weist den Wert dann je Wette aus, statt einen
 * Durchschnitt zu behaupten, den keine einzelne Wette hat.
 */
export function withDerivedRtp(game: Game): Game {
  const tables = paytablesOf(game.id);
  if (tables.length === 0) {
    // Ohne geprüfte Tabelle wird kein RTP behauptet.
    const { rtpDemo: _drop, ...rest } = game;
    void _drop;
    return rest as Game;
  }
  const values = tables.map(rtpOf);
  const first = values[0]!;
  const uniform = values.every((v) => Math.abs(v - first) < 1e-9);
  if (!uniform) {
    const { rtpDemo: _drop, ...rest } = game;
    void _drop;
    return rest as Game;
  }
  return { ...game, rtpDemo: first };
}

export const games: readonly Game[] = baseGames.map(withDerivedRtp);

export function findGameBySlug(slug: string): Game | undefined {
  return games.find((g) => g.slug === slug);
}

export function findGameById(id: string): Game | undefined {
  return games.find((g) => g.id === id);
}

/** Spielbar ist ein Spiel, wenn es aktiv ist und eine Engine sowie eine Tabelle bzw. interaktive Logik hat. */
export function hasPaytable(gameId: string): boolean {
  return paytablesOf(gameId).length > 0;
}
