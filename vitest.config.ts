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
