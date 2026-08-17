import { eq } from "drizzle-orm";
import type { AppDatabase } from "@/server/db/types";
import { provider } from "@/server/db/schema";
import type { ProviderRecord, ProviderRepository, ProviderUpsertInput } from "./types";

/**
 * PostgreSQL-Implementierung von `ProviderRepository`. Gibt ausschließlich `ProviderRecord`
 * zurück — die Drizzle-Zeile deckt sich hier zufällig 1:1 mit dem Domänentyp, trotzdem wird
 * bewusst nicht die Drizzle-Zeile direkt zurückgegeben, damit ein späteres Auseinanderlaufen
 * (z. B. zusätzliche interne Spalten) den Vertrag nach außen nicht stillschweigend ändert.
 */
export class PgProviderRepository implements ProviderRepository {
  constructor(private readonly db: AppDatabase) {}

  async findAll(): Promise<ProviderRecord[]> {
    const rows = await this.db.select().from(provider).orderBy(provider.id);
    return rows.map(toRecord);
  }

  async findById(id: string): Promise<ProviderRecord | null> {
    const [row] = await this.db.select().from(provider).where(eq(provider.id, id)).limit(1);
    return row ? toRecord(row) : null;
  }

  async upsert(input: ProviderUpsertInput): Promise<ProviderRecord> {
    const [row] = await this.db
      .insert(provider)
      .values(input)
      .onConflictDoUpdate({ target: provider.id, set: { name: input.name } })
      .returning();
    if (!row) throw new Error(`Anbieter „${input.id}" konnte nicht gespeichert werden.`);
    return toRecord(row);
  }
}

function toRecord(row: typeof provider.$inferSelect): ProviderRecord {
  return { id: row.id, name: row.name };
}
