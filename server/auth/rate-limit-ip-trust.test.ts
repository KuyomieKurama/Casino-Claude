// @vitest-environment node
// Gleicher Grund wie server/db/migration.test.ts: PGlite braucht die echte Node-Fetch-Implementierung.
import { afterEach, describe, expect, test, vi } from "vitest";
import { createTestDatabase } from "@/server/db/test-harness";

vi.mock("server-only", () => ({}));

const BASE_URL = "http://localhost:3000";

function jsonRequest(path: string, body: unknown, extraHeaders?: Record<string, string>): Request {
  return new Request(`${BASE_URL}/api/auth${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...extraHeaders },
    body: JSON.stringify(body),
  });
}

/**
 * Befund 1 des Security-Reviews (IP-Rate-Limit über X-Forwarded-For umgehbar): eigene Datei statt
 * eines weiteren describe-Blocks in create-auth.test.ts, weil hier — anders als bei allen
 * anderen Fällen dort — env.TRUSTED_PROXY_IPS zwischen den Tests unterschiedlich gesetzt sein
 * muss. Da lib/env.ts sein Ergebnis modulübergreifend einmalig cached (`export const env = ...`),
 * braucht das einen frischen Modul-Import je Konfiguration (`vi.resetModules()` + dynamisches
 * `import("./create-auth")`), nicht nur eine neue better-auth-Instanz.
 */
describe("IP-Rate-Limit und X-Forwarded-For-Vertrauen (server/auth/rate-limit-plugin.ts, lib/env.ts: TRUSTED_PROXY_IPS)", () => {
  const ORIGINAL_TRUSTED_PROXY_IPS = process.env.TRUSTED_PROXY_IPS;

  afterEach(() => {
    if (ORIGINAL_TRUSTED_PROXY_IPS === undefined) delete process.env.TRUSTED_PROXY_IPS;
    else process.env.TRUSTED_PROXY_IPS = ORIGINAL_TRUSTED_PROXY_IPS;
    vi.resetModules();
  });

  test("ohne TRUSTED_PROXY_IPS hebt ein rotierender gefälschter X-Forwarded-For-Header die E-Mail-Sperre nicht auf", async () => {
    delete process.env.TRUSTED_PROXY_IPS;
    vi.resetModules();
    const { createAuth } = await import("./create-auth");
    const db = await createTestDatabase();
    const auth = createAuth(db);

    await auth.handler(jsonRequest("/sign-up/email", { email: "rotierend@example.com", password: "das-richtige-passwort-123", name: "Test" }));

    // Jeder Versuch trägt einen ANDEREN, vom Angreifer frei gewählten X-Forwarded-For-Wert —
    // die E-Mail-Sperre (unabhängig von jeder IP) darf sich davon nicht beeindrucken lassen.
    for (let i = 0; i < 5; i++) {
      const response = await auth.handler(
        jsonRequest("/sign-in/email", { email: "rotierend@example.com", password: "falsch-12345" }, { "x-forwarded-for": `198.51.100.${i}` }),
      );
      expect(response.status).toBe(401);
    }
    const blockedByEmailLimit = await auth.handler(
      jsonRequest("/sign-in/email", { email: "rotierend@example.com", password: "falsch-12345" }, { "x-forwarded-for": "198.51.100.99" }),
    );
    expect(blockedByEmailLimit.status).toBe(429);
  });

  test("ohne TRUSTED_PROXY_IPS bleibt das IP-Limit deaktiviert, auch nach 20+ Versuchen mit stabilem gefälschten Header (verschiedene E-Mails)", async () => {
    delete process.env.TRUSTED_PROXY_IPS;
    vi.resetModules();
    const { createAuth } = await import("./create-auth");
    const db = await createTestDatabase();
    const auth = createAuth(db);

    // EIN stabiler, vom Angreifer frei erfundener X-Forwarded-For-Wert für 20 Versuche mit
    // jeweils ANDERER (nie registrierter) E-Mail — das E-Mail-Limit greift nicht (nur je 1
    // Versuch pro E-Mail), und ohne TRUSTED_PROXY_IPS darf auch kein IP-Limit greifen: better-
    // auth würde diesen einzelnen, unverketteten Header-Wert sonst ungeprüft als Client-IP
    // übernehmen (@better-auth/core/src/utils/ip.ts, Zeilen 329–338) und fälschlich blockieren.
    const forgedIp = "203.0.113.42";
    for (let i = 0; i < 20; i++) {
      const response = await auth.handler(
        jsonRequest("/sign-in/email", { email: `opfer-${i}@example.com`, password: "falsch-12345" }, { "x-forwarded-for": forgedIp }),
      );
      expect(response.status).toBe(401);
    }
    const notBlockedByIpLimit = await auth.handler(
      jsonRequest("/sign-in/email", { email: "opfer-neu@example.com", password: "falsch-12345" }, { "x-forwarded-for": forgedIp }),
    );
    expect(notBlockedByIpLimit.status).toBe(401);
  });

  test("mit konfiguriertem TRUSTED_PROXY_IPS werden unterschiedliche Client-IPs hinter demselben vertrauenswürdigen Proxy einzeln gezählt, nicht zusammengeworfen", async () => {
    process.env.TRUSTED_PROXY_IPS = "203.0.113.1";
    vi.resetModules();
    const { createAuth } = await import("./create-auth");
    const db = await createTestDatabase();
    const auth = createAuth(db);

    // Zweigliedrige Kette "echter Client, dann vertrauenswürdiger Proxy" — genau das Format,
    // das ein per TRUSTED_PROXY_IPS bekannter Reverse-Proxy anhängen würde. JEDER Versuch hat
    // eine ANDERE Client-IP UND eine andere E-Mail: Ist `advanced.ipAddress.trustedProxies`
    // korrekt verdrahtet, löst better-auth für jeden Versuch die jeweils linke, echte Client-IP
    // auf (@better-auth/core/src/utils/ip.ts, getIPFromHeader) — 20 verschiedene IPs, keine
    // davon nähert sich dem Limit von 20 Versuchen/IP.
    //
    // Wichtig für die Aussagekraft dieses Tests: Eine zweigliedrige Kette OHNE korrekt
    // verdrahtete trustedProxies ist laut better-auth "unresolvable" (getIPFromHeader liefert
    // `null`), und `getIp()` fällt in Test-/Entwicklungsumgebungen dafür auf eine FESTE
    // Platzhalter-IP ("127.0.0.1") zurück (@better-auth/core/src/utils/ip.ts, `isTest() ||
    // isDevelopment()`) — bei fehlerhafter Verdrahtung würden dadurch ALLE 20 Versuche auf
    // dieselbe Platzhalter-IP zusammenfallen und fälschlich blockiert werden. Dieser Test prüft
    // deshalb bewusst das GEGENTEIL einer pauschalen Blockade: verschiedene echte Client-IPs
    // dürfen NICHT zusammengeworfen werden.
    for (let i = 0; i < 20; i++) {
      const response = await auth.handler(
        jsonRequest("/sign-in/email", { email: `nutzer-${i}@example.com`, password: "falsch-12345" }, { "x-forwarded-for": `198.51.100.${i}, 203.0.113.1` }),
      );
      expect(response.status).toBe(401);
    }
    const notBlocked = await auth.handler(
      jsonRequest("/sign-in/email", { email: "nutzer-neu@example.com", password: "falsch-12345" }, { "x-forwarded-for": "198.51.100.99, 203.0.113.1" }),
    );
    expect(notBlocked.status).toBe(401);
  });
});
