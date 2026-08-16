/**
 * Übergreifender Konsistenztest — liegt bewusst in test/ und nicht in data/, weil er die
 * Verbindung zwischen Daten, abgeleitetem RTP und Engine-Registry prüft und dafür aus mehreren
 * Schichten importieren muss (die Schichtregel verbietet das innerhalb von data/ zu Recht).
 */
import { describe, expect, it } from "vitest";
import { games } from "@/data/catalog";
import { games as rawGames } from "@/data/games";
import { paytables, paytablesOf, findPaytable, betIdOf } from "@/data/paytables";
import { rtpOf } from "@/lib/paytable";
import { ENGINE_BY_GAME_ID } from "@/components/game/engine/registry";

describe("Katalog und Engine-Registry", () => {
  it("data/games.ts pflegt keinen rtpDemo von Hand — der Wert wird abgeleitet", () => {
    for (const g of rawGames) {
      expect(g.rtpDemo, `${g.name} setzt rtpDemo direkt in games.ts`).toBeUndefined();
    }
  });

  it("abgeleiteter rtpDemo entspricht dem Erwartungswert der Tabelle", () => {
    for (const g of games) {
      const tables = paytablesOf(g.id);
      if (tables.length === 0) {
        expect(g.rtpDemo, `${g.name}`).toBeUndefined();
        continue;
      }
      const values = tables.map(rtpOf);
      const uniform = values.every((v) => Math.abs(v - values[0]!) < 1e-9);
      if (uniform) expect(g.rtpDemo).toBeCloseTo(values[0]!, 9);
      else expect(g.rtpDemo, `${g.name} darf keinen gemeinsamen RTP behaupten`).toBeUndefined();
    }
  });

  it("jede Auszahlungstabelle gehört zu einem existierenden Spiel", () => {
    for (const t of paytables) {
      const gameId = t.gameId.includes("::") ? t.gameId.slice(0, t.gameId.indexOf("::")) : t.gameId;
      expect(games.some((g) => g.id === gameId), `Tabelle ${t.gameId} ohne Spiel`).toBe(true);
    }
  });

  it("Tabellenschlüssel sind eindeutig", () => {
    const ids = paytables.map((t) => t.gameId);
    expect(new Set(ids).size, `Doppelte Schlüssel: ${ids.filter((id, i) => ids.indexOf(id) !== i).join(", ")}`).toBe(ids.length);
  });

  it("jeder Registry-Eintrag verweist auf ein existierendes Spiel", () => {
    for (const id of Object.keys(ENGINE_BY_GAME_ID)) {
      expect(games.some((g) => g.id === id), `Registry kennt unbekanntes Spiel ${id}`).toBe(true);
    }
  });

  it("jedes aktive Spiel hat eine Engine — sonst wäre die Lobby voller nicht spielbarer Kacheln", () => {
    const ohneEngine = games.filter((g) => g.status === "active" && !ENGINE_BY_GAME_ID[g.id]).map((g) => g.name);
    expect(ohneEngine, `Ohne Engine: ${ohneEngine.join(", ")}`).toEqual([]);
  });

  it("findPaytable findet sowohl die einfache als auch die wettbezogene Tabelle", () => {
    const withBet = paytables.find((t) => t.gameId.includes("::"));
    if (withBet) {
      const gameId = withBet.gameId.slice(0, withBet.gameId.indexOf("::"));
      const betId = betIdOf(withBet.gameId)!;
      expect(findPaytable(gameId, betId)?.gameId).toBe(withBet.gameId);
    }
    const simple = paytables.find((t) => !t.gameId.includes("::"));
    if (simple) expect(findPaytable(simple.gameId)?.gameId).toBe(simple.gameId);
    expect(findPaytable("gibt-es-nicht")).toBeUndefined();
  });
});
