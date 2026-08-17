import { eq } from "drizzle-orm";
import type { AppDatabase } from "@/server/db/types";
import { gameMode } from "@/server/db/schema";
import type { GameModeRecord, GameModeRepository, GameModeUpsertInput } from "./types";

/** PostgreSQL-Implementierung von `GameModeRepository` (Modus-Ebene, = heutige Game.id). */
export class PgGameModeRepository implements GameModeRepository {
  constructor(private readonly db: AppDatabase) {}

  async findAll(): Promise<GameModeRecord[]> {
    const rows = await this.db.select().from(gameMode).orderBy(gameMode.sortOrder);
    return rows.map(toRecord);
  }

  async findById(id: string): Promise<GameModeRecord | null> {
    const [row] = await this.db.select().from(gameMode).where(eq(gameMode.id, id)).limit(1);
    return row ? toRecord(row) : null;
  }

  async findByGameId(gameId: string): Promise<GameModeRecord[]> {
    const rows = await this.db.select().from(gameMode).where(eq(gameMode.gameId, gameId)).orderBy(gameMode.sortOrder);
    return rows.map(toRecord);
  }

  async upsert(input: GameModeUpsertInput): Promise<GameModeRecord> {
    const [row] = await this.db
      .insert(gameMode)
      .values(input)
      .onConflictDoUpdate({
        target: gameMode.id,
        set: {
          gameId: input.gameId,
          key: input.key,
          label: input.label,
          kind: input.kind,
          engineKey: input.engineKey,
          paytableKey: input.paytableKey,
          minBetMinor: input.minBetMinor,
          maxBetMinor: input.maxBetMinor,
          isLivePresentation: input.isLivePresentation,
          isDefault: input.isDefault,
          sortOrder: input.sortOrder,
          status: input.status,
          updatedAt: new Date(),
        },
      })
      .returning();
    if (!row) throw new Error(`Spielmodus „${input.id}" konnte nicht gespeichert werden.`);
    return toRecord(row);
  }
}

/** Wandelt Zeitstempel-Spalten (Drizzle liefert `Date`, siehe schema.ts) in ISO-Strings. */
function toRecord(row: typeof gameMode.$inferSelect): GameModeRecord {
  return {
    id: row.id,
    gameId: row.gameId,
    key: row.key,
    label: row.label,
    kind: row.kind,
    engineKey: row.engineKey,
    paytableKey: row.paytableKey,
    minBetMinor: row.minBetMinor,
    maxBetMinor: row.maxBetMinor,
    isLivePresentation: row.isLivePresentation,
    isDefault: row.isDefault,
    sortOrder: row.sortOrder,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
