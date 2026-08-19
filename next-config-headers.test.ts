import { describe, expect, it } from "vitest";
import nextConfig from "./next.config";

/**
 * Prüft die statischen Header aus next.config.ts (headers()) sowie poweredByHeader: false.
 *
 * Die CSP mit Nonce ist bewusst NICHT Teil dieser Datei — next.config.ts.headers() wird einmal
 * beim Start ausgewertet, ein Nonce muss aber pro Anfrage neu sein (middleware.ts,
 * middleware.test.ts). Produktions- und Entwicklungsvariante der reinen Header-Bausteine selbst
 * sind bereits vollständig in lib/security-headers.test.ts abgedeckt; hier wird nur geprüft,
 * dass next.config.ts diese Bausteine korrekt verdrahtet.
 *
 * `isProductionRuntime` ist in next.config.ts absichtlich NICHT mehr exportiert (Befund
 * „middleware.ts importiert next.config“): Der Export existierte nur, damit middleware.ts ihn
 * importieren konnte — dieser Import koppelte das Edge-Bundle der Middleware unnötig an
 * next.config.ts. middleware.ts liest `process.env.NODE_ENV` jetzt direkt (eigene
 * ESLint-Ausnahme, siehe eslint.config.mjs). Dieser Test bildet den erwarteten Wert deshalb
 * selbst aus `process.env.NODE_ENV` nach — Testdateien sind von der `process.env`-Schichtregel
 * ohnehin ausgenommen (siehe `ignores` in eslint.config.mjs).
 */
const isProductionRuntime = process.env.NODE_ENV === "production";

describe("next.config.ts – statische Sicherheitsheader", () => {
  it("deaktiviert den X-Powered-By-Header", () => {
    expect(nextConfig.poweredByHeader).toBe(false);
  });

  it("liefert headers() als Funktion, die für alle Pfade gilt", async () => {
    expect(typeof nextConfig.headers).toBe("function");

    const rules = await nextConfig.headers!();

    expect(rules).toHaveLength(1);
    expect(rules[0]?.source).toBe("/(.*)");
  });

  it("setzt X-Content-Type-Options, Referrer-Policy und Permissions-Policy für alle Pfade", async () => {
    const rules = await nextConfig.headers!();
    const headers = rules[0]?.headers ?? [];
    const keys = headers.map((header) => header.key);

    expect(keys).toContain("X-Content-Type-Options");
    expect(keys).toContain("Referrer-Policy");
    expect(keys).toContain("Permissions-Policy");
  });

  it("setzt Strict-Transport-Security nur, wenn isProductionRuntime wahr ist", async () => {
    const rules = await nextConfig.headers!();
    const headers = rules[0]?.headers ?? [];
    const hasHsts = headers.some((header) => header.key === "Strict-Transport-Security");

    // Unter Vitest ist NODE_ENV "test" (Vitest-Standard), isProductionRuntime also false —
    // dieser Test bleibt trotzdem für beide Fälle korrekt, falls sich das je ändert.
    expect(hasHsts).toBe(isProductionRuntime);
  });

  it("liefert keine Content-Security-Policy über die statischen Header (die kommt mit Nonce aus middleware.ts)", async () => {
    const rules = await nextConfig.headers!();
    const headers = rules[0]?.headers ?? [];
    const keys = headers.map((header) => header.key.toLowerCase());

    expect(keys).not.toContain("content-security-policy");
  });
});
