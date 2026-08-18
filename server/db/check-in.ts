import { sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

/**
 * Baut eine `CHECK (spalte IN (...))`-Bedingung aus einer festen Werteliste.
 *
 * Aus `server/db/schema.ts` hierher ausgelagert (Phase 1), damit die neuen Auth-Tabellen
 * (`server/db/auth-schema.ts`) denselben Helfer nutzen können, statt ihn zu duplizieren (DRY).
 *
 * Bewusst `sql.raw` statt gebundener Parameter: Ein generiertes Migrations-SQL-File wird von
 * drizzle-kit als reiner Text ausgeführt, nicht als vorbereitetes Statement mit Bindings — `$1,
 * $2, …`-Platzhalter in einer CHECK-Klausel wären dort unauflösbare Parameter und die Migration
 * würde fehlschlagen. Sicher ist das hier trotzdem: `values` kommt ausschließlich aus festen
 * Konstanten in `./enums.ts`, nie aus Nutzereingaben.
 */
export function checkIn(column: AnyPgColumn, values: readonly string[]): ReturnType<typeof sql> {
  const literals = values.map((value) => `'${value.replace(/'/g, "''")}'`).join(", ");
  return sql`${column} in (${sql.raw(literals)})`;
}
