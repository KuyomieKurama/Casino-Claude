import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

/**
 * Vitest-Konfiguration mit drei Testgruppen:
 * - npm test (Standard-Config ohne RTP-Simulationstests) — schnell für Entwicklung
 * - npm run test:rtp — nur RTP-Simulationstests (5 Tests)
 * - npm run test:full — alles (1021 Tests)
 *
 * Verwendung:
 *   npm test                    # Schnell: ohne RTP-Simulationen (~120 Sekunden)
 *   npm run test:rtp            # Nur Simulationen (~18 Sekunden)
 *   npm run test:full           # Alles (Verifikation, CI/CD) (~127 Sekunden)
 *   npm run test:watch          # Watch-Modus (Standard-Config ohne RTP)
 *
 * Implementierung: Vitest --testNamePattern in package.json filtert Test-Namen.
 * RTP-Simulationstests sind mit Namen erkennbar:
 *   - "RTP-Simulation" (arcade, lib/rng)
 *   - "PRNG-Simulation" (slots, roulette)
 *   - "gemessene Verteilung und RTP" (baccarat)
 * Siehe package.json npm-Skripte für Regex-Details.
 */

const common = {
  environment: "jsdom",
  globals: true,
  setupFiles: ["./test/setup.ts"],
  exclude: ["node_modules", ".next"],
  testTimeout: 120_000,
  hookTimeout: 30_000,
  poolOptions: {
    forks: {
      maxForks: 4,
    },
  },
  env: {
    DATABASE_URL: "postgresql://vitest:vitest@localhost:5432/vitest_placeholder",
    BETTER_AUTH_SECRET: "vitest-fixture-secret-mindestens-32-zeichen-lang",
    BETTER_AUTH_URL: "http://localhost:3000",
    OAUTH_DISCORD_CLIENT_ID: "vitest-fixture-discord-client-id",
    OAUTH_DISCORD_CLIENT_SECRET: "vitest-fixture-discord-client-secret",
  },
};

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
  test: {
    ...common,
    include: ["**/*.test.{ts,tsx}"],
  },
});
