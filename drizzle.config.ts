import { defineConfig } from "drizzle-kit";

/**
 * Konfiguration für drizzle-kit (generate/migrate), nicht für die Anwendung selbst — deshalb
 * hier ausnahmsweise ein direkter `process.env`-Zugriff statt über `lib/env.ts` (dieselbe
 * Ausnahme wie in next.config.ts für NEXT_OUTPUT). `generate` braucht keine echte Verbindung
 * (reine Schema-Introspektion), `migrate` schon — deshalb der Fallback nur für den lokalen
 * Optionsfall, mit klarem Hinweis statt eines geratenen Hosts.
 */
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL fehlt. Was tun: Vor `npm run db:generate`/`db:migrate` eine PostgreSQL-Verbindung " +
      "in der Umgebung setzen, z. B. via .env (siehe .env.example).",
  );
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./server/db/schema.ts",
  out: "./server/db/migrations",
  dbCredentials: { url: databaseUrl },
});
