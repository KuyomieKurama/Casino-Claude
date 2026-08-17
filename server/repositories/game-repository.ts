import { eq } from "drizzle-orm";
import type { AppDatabase } from "@/server/db/types";
import { game } from "@/server/db/schema";
import type { GameRecord, GameRepository, GameUpsertInput } from "./types";

/** PostgreSQL-Implementierung von `GameRepository` (Titel-Ebene). */
export class PgGameRepository implements GameRepository {
  constructor(private readonly db: AppDatabase) {}

  async findAll(): Promise<GameRecord[]> {
    const rows = await this.db.select().from(game).orderBy(game.sortOrder);
    return rows.map(toRecord);
  }

  async findById(id: string): Promise<GameRecord | null> {
    const [row] = await this.db.select().from(game).where(eq(game.id, id)).limit(1);
    return row ? toRecord(row) : null;
  }

  async findBySlug(slug: string): Promise<GameRecord | null> {
    const [row] = await this.db.select().from(game).where(eq(game.slug, slug)).limit(1);
    return row ? toRecord(row) : null;
  }

  async upsert(input: GameUpsertInput): Promise<GameRecord> {
    const [row] = await this.db
      .insert(game)
      .values({ ...input, releasedAt: new Date(input.releasedAt) })
      .onConflictDoUpdate({
        target: game.id,
        set: {
          slug: input.slug,
          name: input.name,
          category: input.category,
          providerId: input.providerId,
          description: input.description,
          status: input.status,
          isFeatured: input.isFeatured,
          isNew: input.isNew,
          isPopular: input.isPopular,
          releasedAt: new Date(input.releasedAt),
          popularityScore: input.popularityScore,
          sortOrder: input.sortOrder,
          updatedAt: new Date(),
        },
      })
      .returning();
    if (!row) throw new Error(`Titel „${input.id}" konnte nicht gespeichert werden.`);
    return toRecord(row);
  }
}

/** Wandelt Zeitstempel-Spalten (Drizzle liefert `Date`, siehe schema.ts) in ISO-Strings. */
function toRecord(row: typeof game.$inferSelect): GameRecord {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    category: row.category,
    providerId: row.providerId,
    description: row.description,
    status: row.status,
    isFeatured: row.isFeatured,
    isNew: row.isNew,
    isPopular: row.isPopular,
    releasedAt: row.releasedAt.toISOString(),
    popularityScore: row.popularityScore,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
