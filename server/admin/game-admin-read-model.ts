import type { AppDatabase } from "@/server/db/types";
import { PgGameModeRepository } from "@/server/repositories/game-mode-repository";
import { PgGameRepository } from "@/server/repositories/game-repository";
import type { GameModeRecord, GameRecord } from "@/server/repositories/types";
import type { AdminGameItem, AdminGameModeItem } from "@/types/admin";

/**
 * Lesepfad für die Spielverwaltung (Admin-Auftrag §2). Keine Paginierung: der Katalog ist mit
 * rund 24 Titeln fest und klein (CLAUDE.md), eine Blätterung wäre hier nur Ballast (YAGNI).
 *
 * Mappt die Repository-internen Records auf die geteilten UI-Typen aus `types/admin.ts` — dieselbe
 * Begründung wie server/wallet/ledger-history.ts::toTransaction: `components/admin/GamesTable.tsx`
 * darf laut Schichtregel nicht aus `@/server/*` importieren, die Abbildung passiert deshalb hier,
 * bevor die Daten den Server-Layer verlassen.
 */
function toModeItem(mode: GameModeRecord): AdminGameModeItem {
  return { id: mode.id, gameId: mode.gameId, label: mode.label, status: mode.status, sortOrder: mode.sortOrder, engineKey: mode.engineKey, paytableKey: mode.paytableKey };
}

function toGameItem(game: GameRecord, modes: GameModeRecord[]): AdminGameItem {
  return { id: game.id, slug: game.slug, name: game.name, status: game.status, isFeatured: game.isFeatured, sortOrder: game.sortOrder, modes: modes.map(toModeItem) };
}

export async function resolveAdminGameOverview(db: AppDatabase): Promise<AdminGameItem[]> {
  const gameRepo = new PgGameRepository(db);
  const modeRepo = new PgGameModeRepository(db);
  const [games, modes] = await Promise.all([gameRepo.findAll(), modeRepo.findAll()]);

  const modesByGameId = new Map<string, GameModeRecord[]>();
  for (const mode of modes) {
    const list = modesByGameId.get(mode.gameId) ?? [];
    list.push(mode);
    modesByGameId.set(mode.gameId, list);
  }

  return games.map((game) => toGameItem(game, modesByGameId.get(game.id) ?? []));
}
