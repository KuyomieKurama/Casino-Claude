/**
 * Eigenständiges CLI-Skript (`npm run db:seed`) — bewusst OHNE Import von server/db/client.ts
 * oder lib/env.ts. Beide sind mit `import "server-only"` markiert; dieses Marker-Paket wirft
 * beim Import immer eine Exception, außer ein Bundler löst es explizit über die
 * "react-server"-Bedingung auf (das übernimmt bei Next.js ein eigener Webpack-Loader für den
 * Server-Layer, siehe next/dist/build/webpack-config.js). Ein direkt mit `node` gestartetes
 * Skript durchläuft diesen Loader nicht — ein Import von client.ts/env.ts würde hier sofort
 * abbrechen. Dieses Skript baut sich deshalb eine eigene, kurzlebige Verbindung: Pool öffnen,
 * seeden, schließen. Der globalThis-Singleton aus client.ts existiert nur für Next.js'
 * Hot-Reload-Problem, das ein einmalig laufendes Skript nicht hat.
 *
 * Ausnahme vom `process.env`-Verbot (siehe eslint.config.mjs, Regel "kein process.env außerhalb
 * lib/env.ts"): wie next.config.ts und drizzle.config.ts liest auch dieses Skript seine
 * Konfiguration direkt, weil es kein Teil der Next.js-Laufzeit ist, die lib/env.ts bedient.
 *
 * Ausführung: `node --experimental-transform-types
 * --experimental-loader=./scripts/ts-alias-loader.mjs server/seed/run-seed.ts` (siehe
 * package.json). Node 22.7+ kann TypeScript-Dateien so ohne zusätzliche Abhängigkeit (kein
 * ts-node/tsx) direkt ausführen — wichtig, weil im Projekt nur die im Auftrag exakt benannten
 * Pakete installiert werden dürfen. `--experimental-transform-types` statt des reinen
 * `--experimental-strip-types`, weil die Repository-Klassen (server/repositories/*.ts)
 * TypeScript-Parameter-Properties nutzen (`constructor(private readonly db: …)`) — eine
 * Kurzschreibweise, die tatsächlichen Code erzeugt und deshalb eine echte Transformation
 * braucht, nicht nur das Entfernen von Typannotationen. Der Ladehook ersetzt zusätzlich den
 * `@/`-Pfad-Alias und erweiterungslose/Verzeichnis-Importe (siehe scripts/ts-alias-loader.mjs) —
 * das kann Node ohne Next.js/Vite nicht selbst auflösen, obwohl der komplette restliche Code
 * (data/, server/) diese Schreibweise unverändert nutzt.
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as authSchema from "../db/auth-schema";
import * as catalogSchema from "../db/schema";
import { bootstrapAdmin } from "../auth/bootstrap-admin";
import { seedCatalog } from "./seed";

const schema = { ...catalogSchema, ...authSchema };

function requireDatabaseUrl(): string {
  const value = process.env.DATABASE_URL;
  const hasValidProtocol = typeof value === "string" && (value.startsWith("postgres://") || value.startsWith("postgresql://"));
  if (!hasValidProtocol) {
    throw new Error(
      "DATABASE_URL fehlt oder hat ein ungültiges Protokoll. Was tun: Vor `npm run db:seed` eine " +
        "PostgreSQL-Verbindung setzen, z. B. postgresql://user:passwort@localhost:5432/velora " +
        "(siehe .env.example).",
    );
  }
  return value;
}

async function main(): Promise<void> {
  const pool = new Pool({ connectionString: requireDatabaseUrl() });
  const db = drizzle(pool, { schema });
  try {
    const result = await seedCatalog(db);
    console.log(`Seed abgeschlossen: ${result.providerCount} Anbieter, ${result.gameCount} Titel, ${result.gameModeCount} Modi.`);

    // Admin-Bootstrap: siehe server/auth/bootstrap-admin.ts — der einzige Ort, an dem eine
    // Rolle auf "admin" gesetzt wird. Ohne gesetzte ADMIN_BOOTSTRAP_EMAIL passiert nichts.
    const adminBootstrapEmail = process.env.ADMIN_BOOTSTRAP_EMAIL;
    if (adminBootstrapEmail) {
      const { promoted } = await bootstrapAdmin(db, adminBootstrapEmail);
      console.log(
        promoted
          ? `Admin-Bootstrap: „${adminBootstrapEmail}" ist jetzt Admin.`
          : `Admin-Bootstrap: Kein Konto mit „${adminBootstrapEmail}" gefunden — zuerst regulär registrieren, dann erneut seeden.`,
      );
    }
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error("Seed fehlgeschlagen:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
