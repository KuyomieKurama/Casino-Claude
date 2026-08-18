import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./test/setup.ts"],
    include: ["**/*.test.{ts,tsx}"],
    exclude: ["node_modules", ".next"],
    // Einige Tests simulieren Millionen Runden, um RTP-Aussagen zu belegen.
    testTimeout: 120_000,
    // 24 Testdateien erzeugen mit createTestDatabase() (server/db/test-harness.ts) je Test eine
    // frische PGlite-Instanz inkl. echter Migration. Isoliert dauert das ~1,5 s (gemessen).
    // Vitests Standard-Pool ist "forks" mit einem Fork je verfügbarem CPU-Kern — laufen mehrere
    // dieser Dateien parallel, konkurrieren ihre PGlite-Starts um CPU-Zeit. Ein Stresstest mit
    // 16 gleichzeitigen PGlite-Instanzen in einem Prozess zeigte Einzelzeiten bis zu ~15 s statt
    // 1,5 s isoliert — das erklärt den beobachteten "Hook timed out in 10000ms" in
    // server/auth/create-auth.test.ts (beforeEach dort ruft createTestDatabase() vor jedem der
    // 14 Tests neu auf). 30 s hookTimeout gibt reichlich Sicherheitsabstand (2x das gemessene
    // Worst-Case-Szenario), OHNE das eigentliche Problem (Ressourcenkonkurrenz) zu ignorieren —
    // siehe poolOptions.forks.maxForks unten, das die Zahl gleichzeitiger PGlite-Starts begrenzt.
    hookTimeout: 30_000,
    poolOptions: {
      forks: {
        // Begrenzt gleichzeitige Testdatei-Prozesse fest auf 4 (unabhängig von der Kernzahl der
        // Maschine): Der Engpass ist nicht fehlende CPU-Leistung, sondern dass viele parallele
        // PGlite-Instanzen (WASM-Postgres, je eigener Speicher- und Migrationsaufwand) sich
        // gegenseitig ausbremsen, siehe Messung oben. 4 gleichzeitige Prozesse halten die
        // PGlite-Konkurrenz niedrig, ohne die Laufzeit der Gesamtsuite unnötig zu verlängern
        // (die meisten der 75 Testdateien sind reine Logiktests ohne Datenbank und sehr schnell).
        maxForks: 4,
      },
    },
    env: {
      // Baseline für alle Tests, die lib/env.ts oder server/auth/create-auth.ts importieren
      // (Phase 1). Keine echten Geheimnisse/Verbindungen: reine Test-Fixture-Werte, nie
      // außerhalb von Vitest verwendet — server/auth-Tests bauen ihre better-auth-Instanz
      // gegen eine PGlite-Testdatenbank (server/db/test-harness.ts), DATABASE_URL wird nur
      // gebraucht, damit lib/env.ts beim Import nicht abbricht, nie um sich wirklich zu
      // verbinden. Einzelne Tests überschreiben/löschen diese Variablen gezielt, wo ihr
      // Fehlen Teil des Testfalls ist (siehe lib/env.test.ts).
      DATABASE_URL: "postgresql://vitest:vitest@localhost:5432/vitest_placeholder",
      BETTER_AUTH_SECRET: "vitest-fixture-secret-mindestens-32-zeichen-lang",
      BETTER_AUTH_URL: "http://localhost:3000",
      // Aktiviert den Discord-Provider für server/auth/create-auth.test.ts (Account-
      // Verknüpfungstests, echte OAuth-Netzwerkaufrufe dort per vi.stubGlobal("fetch", …)
      // ersetzt — diese "Zugangsdaten" werden nie für einen echten Request verwendet).
      // server/auth/providers.test.ts setzt seine eigene Umgebung isoliert und ist davon
      // nicht betroffen (siehe dortiges resetOAuthEnv()).
      OAUTH_DISCORD_CLIENT_ID: "vitest-fixture-discord-client-id",
      OAUTH_DISCORD_CLIENT_SECRET: "vitest-fixture-discord-client-secret",
    },
  },
});
