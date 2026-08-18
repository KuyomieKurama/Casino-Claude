import "server-only";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { env } from "@/lib/env";
import * as authSchema from "./auth-schema";
import * as catalogSchema from "./schema";

/** Zusammengeführtes Schema (Katalog + Auth) — eine Drizzle-Instanz für die ganze Anwendung. */
const schema = { ...catalogSchema, ...authSchema };

/**
 * Verbindungs-Pool für die laufende Anwendung (spätere Route Handler/Server Components,
 * nicht Teil dieser Phase). `import "server-only"` verhindert, dass dieses Modul versehentlich
 * in ein Client-Bundle gerät — Next.js löst das über eigene Webpack-Layer auf; außerhalb von
 * Next (z. B. ein eigenständiges Skript) darf dieses Modul deshalb NICHT importiert werden.
 * Das Seed-Skript (server/seed/run-seed.ts) baut sich deshalb bewusst eine eigene, kurzlebige
 * Verbindung statt dieses Moduls zu importieren.
 *
 * Hot-Reload-Schutz: `next dev` lädt Server-Module bei jeder Änderung neu aus. Ohne den
 * globalThis-Umweg würde jeder Reload einen neuen Pool eröffnen, ohne den alten zu schließen —
 * die Verbindungen liefen der Datenbank davon. Im Produktionsbetrieb (ein Prozessstart) ist
 * das Verhalten identisch zu einem einfachen Modul-Singleton.
 */
declare global {
  // `var` ist hier Pflicht (nicht `let`/`const`): TypeScript erlaubt nur `var` in `declare
  // global`-Blöcken für neue globalThis-Eigenschaften.
  var __veloraDbPool: Pool | undefined;
}

function createPool(): Pool {
  return new Pool({ connectionString: env.DATABASE_URL });
}

const pool = globalThis.__veloraDbPool ?? createPool();

if (env.NODE_ENV !== "production") {
  globalThis.__veloraDbPool = pool;
}

export const db = drizzle(pool, { schema });
