import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type * as schema from "./schema";

/**
 * Datenbank-Typ, unabhängig vom Treiber. Repositories und das Seed-Skript arbeiten gegen
 * diesen Typ, nicht gegen `NodePgDatabase`/`PgliteDatabase` direkt — dieselbe Repository-
 * Implementierung läuft damit unverändert gegen die echte Datenbank (server/db/client.ts)
 * und gegen PGlite in Tests (server/db/test-harness.ts).
 *
 * Keine Seiteneffekte und kein `server-only` hier: Diese Datei baut keine Verbindung auf,
 * sie beschreibt nur einen Typ — deshalb darf sie auch aus Tests importiert werden.
 */
export type AppDatabase = PgDatabase<PgQueryResultHKT, typeof schema>;
