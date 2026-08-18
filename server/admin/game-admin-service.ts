import type { AppDatabase } from "@/server/db/types";
import { PgGameModeRepository } from "@/server/repositories/game-mode-repository";
import { PgGameRepository } from "@/server/repositories/game-repository";
import type { CatalogStatus, GameModeRecord, GameRecord } from "@/server/repositories/types";
import { runAuditedAdminAction } from "./audit";

/**
 * Spielverwaltung (Admin-Auftrag §2). `paytable_key`, `engine_key` und der ausgewiesene RTP sind
 * über diesen Service AN KEINER STELLE änderbar — es gibt hier bewusst keine Funktion, die diese
 * Felder schreibt (dieselbe strukturelle Absicherung wie bei der Admin-Rolle in
 * user-admin-repository.ts). Begründung (Auftrag): der RTP wird aus der geprüften Paytable
 * berechnet (data/catalog.ts::withDerivedRtp()); eine editierbare Anzeige könnte von der
 * Simulation abweichen und damit etwas behaupten, das nicht geprüft ist.
 */

export type SetGameStatusResult = { ok: true; game: GameRecord } | { ok: false; reason: "NOT_FOUND" } | { ok: false; reason: "NO_ACTIVE_MODE" };

/**
 * Admin-Auftrag §2: „Ein Titel darf nicht ohne mindestens einen aktiven Modus aktiv sein —
 * serverseitig erzwingen." Die Prüfung greift nur beim Aktivieren (nicht beim Deaktivieren, das
 * ist immer erlaubt) und läuft VOR der Transaktion, damit ein Verstoß gar nicht erst einen
 * (dann zurückzurollenden) Schreibversuch auslöst.
 */
export async function setGameStatus(db: AppDatabase, actorUserId: string, gameId: string, status: CatalogStatus): Promise<SetGameStatusResult> {
  const gameRepo = new PgGameRepository(db);
  const before = await gameRepo.findById(gameId);
  if (!before) return { ok: false, reason: "NOT_FOUND" };
  if (before.status === status) return { ok: true, game: before };

  if (status === "active") {
    const modeRepo = new PgGameModeRepository(db);
    const modes = await modeRepo.findByGameId(gameId);
    const hasActiveMode = modes.some((m) => m.status === "active");
    if (!hasActiveMode) return { ok: false, reason: "NO_ACTIVE_MODE" };
  }

  const game = await runAuditedAdminAction(db, { actorUserId, action: "game.status.update", entityType: "game", entityId: gameId }, async (tx) => {
    const after = await new PgGameRepository(tx).upsert({ ...toUpsertInput(before), status });
    return { result: after, before: { status: before.status }, after: { status: after.status } };
  });

  return { ok: true, game };
}

export interface GameListingPatch {
  isFeatured?: boolean;
  sortOrder?: number;
}

/** Vitrinenfelder ohne Fachregel-Einschränkung — anders als `setGameStatus` keine Invariante zu prüfen. */
export async function updateGameListingFields(db: AppDatabase, actorUserId: string, gameId: string, patch: GameListingPatch): Promise<{ ok: true; game: GameRecord } | { ok: false; reason: "NOT_FOUND" }> {
  const gameRepo = new PgGameRepository(db);
  const before = await gameRepo.findById(gameId);
  if (!before) return { ok: false, reason: "NOT_FOUND" };

  const nextIsFeatured = patch.isFeatured ?? before.isFeatured;
  const nextSortOrder = patch.sortOrder ?? before.sortOrder;
  if (nextIsFeatured === before.isFeatured && nextSortOrder === before.sortOrder) return { ok: true, game: before };

  const game = await runAuditedAdminAction(db, { actorUserId, action: "game.listing.update", entityType: "game", entityId: gameId }, async (tx) => {
    const after = await new PgGameRepository(tx).upsert({ ...toUpsertInput(before), isFeatured: nextIsFeatured, sortOrder: nextSortOrder });
    return {
      result: after,
      before: { isFeatured: before.isFeatured, sortOrder: before.sortOrder },
      after: { isFeatured: after.isFeatured, sortOrder: after.sortOrder },
    };
  });

  return { ok: true, game };
}

export type SetGameModeStatusResult =
  | { ok: true; mode: GameModeRecord }
  | { ok: false; reason: "NOT_FOUND" }
  | { ok: false; reason: "LAST_ACTIVE_MODE_OF_ACTIVE_GAME" };

/**
 * Spiegelbildliche Absicherung derselben Invariante beim Deaktivieren EINES Modus: wäre der
 * betroffene Titel aktiv und dieser Modus der letzte aktive, würde die Invariante ebenso
 * verletzt wie beim direkten Aktivieren eines Titels ohne aktiven Modus.
 */
export async function setGameModeStatus(db: AppDatabase, actorUserId: string, modeId: string, status: CatalogStatus): Promise<SetGameModeStatusResult> {
  const modeRepo = new PgGameModeRepository(db);
  const before = await modeRepo.findById(modeId);
  if (!before) return { ok: false, reason: "NOT_FOUND" };
  if (before.status === status) return { ok: true, mode: before };

  if (status === "inactive") {
    const parentGame = await new PgGameRepository(db).findById(before.gameId);
    if (parentGame?.status === "active") {
      const siblings = await modeRepo.findByGameId(before.gameId);
      const otherActiveModes = siblings.filter((m) => m.id !== modeId && m.status === "active");
      if (otherActiveModes.length === 0) return { ok: false, reason: "LAST_ACTIVE_MODE_OF_ACTIVE_GAME" };
    }
  }

  const mode = await runAuditedAdminAction(db, { actorUserId, action: "game_mode.status.update", entityType: "game_mode", entityId: modeId }, async (tx) => {
    const after = await new PgGameModeRepository(tx).upsert({ ...toModeUpsertInput(before), status });
    return { result: after, before: { status: before.status }, after: { status: after.status } };
  });

  return { ok: true, mode };
}

/** `GameRecord` minus `createdAt`/`updatedAt` (= `GameUpsertInput`, server/repositories/types.ts) — explizit statt Destructure-und-Verwerfen, damit kein ungenutzter Bezeichner entsteht. */
function toUpsertInput(game: GameRecord): Omit<GameRecord, "createdAt" | "updatedAt"> {
  return {
    id: game.id,
    slug: game.slug,
    name: game.name,
    category: game.category,
    providerId: game.providerId,
    description: game.description,
    status: game.status,
    isFeatured: game.isFeatured,
    isNew: game.isNew,
    isPopular: game.isPopular,
    releasedAt: game.releasedAt,
    popularityScore: game.popularityScore,
    sortOrder: game.sortOrder,
  };
}

/** `GameModeRecord` minus `createdAt`/`updatedAt` (= `GameModeUpsertInput`). */
function toModeUpsertInput(mode: GameModeRecord): Omit<GameModeRecord, "createdAt" | "updatedAt"> {
  return {
    id: mode.id,
    gameId: mode.gameId,
    key: mode.key,
    label: mode.label,
    kind: mode.kind,
    engineKey: mode.engineKey,
    paytableKey: mode.paytableKey,
    minBetMinor: mode.minBetMinor,
    maxBetMinor: mode.maxBetMinor,
    isLivePresentation: mode.isLivePresentation,
    isDefault: mode.isDefault,
    sortOrder: mode.sortOrder,
    status: mode.status,
  };
}
