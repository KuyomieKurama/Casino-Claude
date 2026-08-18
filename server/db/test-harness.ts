import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as authSchema from "./auth-schema";
import * as catalogSchema from "./schema";

const schema = { ...catalogSchema, ...authSchema };

/**
 * Test-Werkzeug, KEIN Test selbst (Dateiname endet nicht auf `.test.ts`, damit Vitest sie
 * nicht als Testdatei einsammelt).
 *
 * PGlite ist ein In-Process-PostgreSQL — echte Postgres-Semantik (CHECK-Constraints,
 * partielle Unique-Indizes, Fremdschlüssel) ohne Docker. Jeder Aufruf erzeugt eine frische,
 * isolierte Datenbank und wendet die echten generierten Migrationen an (server/db/migrations),
 * nicht nur eine Kopie des Schemas — damit testet „Migration läuft sauber durch" tatsächlich
 * die ausgelieferten SQL-Dateien und nicht nur schema.ts.
 */
export type TestDatabase = PgliteDatabase<typeof schema>;

export async function createTestDatabase(): Promise<TestDatabase> {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: "./server/db/migrations" });
  return db;
}

/**
 * Minimale gültige Vorkette (provider → game), damit Tests, denen es nur um `game_mode` geht,
 * nicht jedes Mal alle Pflichtfelder der übergeordneten Tabellen wiederholen müssen.
 */
export async function seedMinimalCatalog(db: TestDatabase): Promise<{ providerId: string; gameId: string }> {
  const providerId = "test-provider";
  const gameId = "test-game";
  await db.insert(schema.provider).values({ id: providerId, name: "Testanbieter" });
  await db.insert(schema.game).values({
    id: gameId,
    slug: "test-game",
    name: "Testspiel",
    category: "slots",
    providerId,
    description: "Nur für Tests.",
    status: "active",
    releasedAt: new Date("2025-01-01T00:00:00.000Z"),
    popularityScore: 0,
    sortOrder: 0,
  });
  return { providerId, gameId };
}
