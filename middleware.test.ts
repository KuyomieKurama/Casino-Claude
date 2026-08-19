import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { buildContentSecurityPolicy } from "./lib/security-headers";
import { middleware } from "./middleware";

/**
 * middleware.ts importiert next.config.ts absichtlich NICHT mehr (Befund „middleware.ts
 * importiert next.config“): Der frühere Import koppelte das separat kompilierte Edge-Bundle der
 * Middleware an next.config.ts — sobald dort ein Node-spezifisches Modul dazukäme, würde das den
 * Middleware-Build oder ihre Laufzeit brechen, ohne dass die Middleware selbst etwas mit diesem
 * Modul zu tun hätte. middleware.ts liest `process.env.NODE_ENV` seither direkt (eigene
 * ESLint-Ausnahme, siehe eslint.config.mjs). Dieser Test bildet den erwarteten Produktionswert
 * deshalb ebenso direkt nach, statt ihn aus next.config.ts zu importieren — Testdateien sind von
 * der `process.env`-Schichtregel ohnehin ausgenommen (siehe `ignores` in eslint.config.mjs).
 */
const isProductionRuntime = process.env.NODE_ENV === "production";

/**
 * Regressionstests für den Produktionsfehler `TypeError: Invalid URL` (ERR_INVALID_URL) bei
 * JEDEM Aufruf eines geschützten Pfads. Ursache war ein Location-Header, den die Middleware
 * selbst gesetzt hat — erst absolut mit falscher (interner) Origin, dann relativ, was an der
 * Location-Header-Validierung der Next.js-Edge-Laufzeit scheiterte (siehe Kommentar in
 * middleware.ts für die vollständige Herleitung).
 *
 * WARUM DER FRÜHERE TEST DEN FEHLER NICHT GEFUNDEN HAT (und warum dieser Test das auch nur
 * TEILWEISE leistet): `middleware()` wird hier direkt als Funktion aufgerufen, ihr Rückgabewert
 * geprüft — das ist eine Unit-Prüfung auf Code-Ebene. Die Validierung, die in Produktion
 * `ERR_INVALID_URL` geworfen hat, läuft aber NICHT in dieser Funktion, sondern erst danach in
 * der kompilierten Next.js-Edge-Laufzeit (`.next/server/middleware.js`), wenn sie den
 * Rückgabewert in eine tatsächliche HTTP-Response überführt. Diese Laufzeit wird in Vitest nicht
 * ausgeführt (kein Edge-Runtime-Sandbox, kein `next build`-Artefakt eingebunden) und lässt sich
 * mit vertretbarem Aufwand auch nicht dort hineinziehen. Ein Unit-Test kann diese Validierung
 * deshalb grundsätzlich nicht direkt nachstellen.
 *
 * Was dieser Test stattdessen tut und WARUM DAS HIER AUSREICHT: Die gewählte Lösung (Weg A,
 * siehe middleware.ts) entfernt die gesamte Fehlerklasse strukturell — die Middleware baut gar
 * keine Response mit einem Location-Header mehr. Ein Location-Header ist die einzige Stelle, an
 * der die beschriebene Laufzeit-Validierung überhaupt greift; ohne Location-Header gibt es nichts
 * zu validieren. Diese Tests prüfen deshalb, dass die Middleware STRUKTURELL keinen
 * Redirect/Location-Header mehr erzeugen kann (weder Status 3xx noch ein `location`-Header, in
 * keinem der beiden Cookie-Zustände) — das ist eine gültige Absicherung GENAU für diese
 * Lösung, weil die Abwesenheit des Location-Headers hier ursächlich mit der Abwesenheit des
 * Fehlers zusammenhängt, nicht nur zufällig korreliert.
 *
 * Was dieser Test NICHT leisten kann: Er beweist nicht, dass `redirect()` aus
 * `next/navigation` in app/(user)/layout.tsx bzw. den app/admin/*-Seiten in der echten
 * Next.js-Produktionslaufzeit tatsächlich zu einer 30x-Antwort statt zu einem Fehler führt —
 * das ist eine andere Code-/Laufzeit-Stelle mit eigenem Mechanismus (siehe deren eigene Tests:
 * app/(user)/layout.test.tsx, app/admin/page.test.tsx). Und er kann keine künftige Änderung
 * verhindern, die einen Location-Header über einen anderen Mechanismus einführt (z. B. direkt
 * über `response.headers.set("location", …)` in einer völlig neuen Middleware-Funktion) UND
 * dabei zufällig eine gültige absolute URL erzeugt — ein Unit-Test ohne echte Next.js-Laufzeit
 * kann eine absolute von einer ungültigen relativen URL zwar unterscheiden (das prüfen wir
 * unten zusätzlich, siehe letzter Testfall), aber nicht mit letzter Sicherheit vorhersagen, ob
 * die Next.js-Version im Einsatz dieselbe Validierung überhaupt noch so durchführt. Der
 * verbindliche Nachweis gegen das reale Fehlerbild ist deshalb zusätzlich ein Lauf gegen den
 * gebauten Produktionsserver (`npm run build` + `npm start`, siehe Verifikationsnachweis in der
 * Aufgabenantwort) — dieser Test hier ist die schnelle, jederzeit lauffähige Regressionssicherung
 * auf Code-Ebene, kein Ersatz für den Laufzeit-Nachweis.
 */

const INTERNAL_ORIGIN = "http://localhost:3000";

function requestWithoutSession(path: string): NextRequest {
  return new NextRequest(new URL(path, INTERNAL_ORIGIN));
}

function requestWithSession(path: string): NextRequest {
  return new NextRequest(new URL(path, INTERNAL_ORIGIN), {
    headers: { cookie: "better-auth.session_token=fixture-token" },
  });
}

describe("middleware", () => {
  describe("erzeugt in keinem Fall mehr eine eigene Weiterleitung (Regressionstest ERR_INVALID_URL)", () => {
    const protectedPaths = ["/wallet", "/history", "/profile", "/favorites", "/settings", "/bonuses", "/security", "/admin"];

    it.each(protectedPaths)("kein Location-Header und kein 3xx-Status ohne Sitzungs-Cookie für %s", (path) => {
      const response = middleware(requestWithoutSession(path));

      expect(response.headers.get("location")).toBeNull();
      expect(response.status).toBeLessThan(300);
    });

    it.each(protectedPaths)("kein Location-Header und kein 3xx-Status mit Sitzungs-Cookie für %s", (path) => {
      const response = middleware(requestWithSession(path));

      expect(response.headers.get("location")).toBeNull();
      expect(response.status).toBeLessThan(300);
    });

    it("reicht den Request in beiden Cookie-Zuständen unverändert durch (x-middleware-next)", () => {
      const withoutSession = middleware(requestWithoutSession("/profile"));
      const withSession = middleware(requestWithSession("/profile"));

      expect(withoutSession.headers.get("x-middleware-next")).toBe("1");
      expect(withSession.headers.get("x-middleware-next")).toBe("1");
    });
  });

  describe("x-pathname-Plumbing für app/(user)/layout.tsx", () => {
    it("reicht Pfad und Query-String als x-pathname-Header durch, auch OHNE Sitzungs-Cookie", () => {
      // Anders als vor dem Fix: früher wurde x-pathname nur bei vorhandenem Cookie gesetzt, weil
      // die Middleware im Cookie-losen Fall selbst umgeleitet hat. Jetzt reicht sie in jedem Fall
      // nur durch — das Layout braucht den Header deshalb jetzt in BEIDEN Fällen.
      const response = middleware(requestWithoutSession("/wallet?tab=verlauf"));

      expect(response.headers.get("x-middleware-request-x-pathname")).toBe("/wallet?tab=verlauf");
    });

    it("reicht Pfad und Query-String als x-pathname-Header durch, mit Sitzungs-Cookie", () => {
      const response = middleware(requestWithSession("/profile?tab=sicherheit"));

      expect(response.headers.get("x-middleware-request-x-pathname")).toBe("/profile?tab=sicherheit");
    });

    it("kodiert den x-pathname-Header nicht selbst um (Rohwert, safeNext() in den Layouts prüft ihn)", () => {
      const url = new URL("/wallet", INTERNAL_ORIGIN);
      url.searchParams.set("query", "hallo welt äöü & mehr");
      const response = middleware(requestWithoutSession(url.pathname + url.search));

      expect(response.headers.get("x-middleware-request-x-pathname")).toBe("/wallet?query=hallo+welt+%C3%A4%C3%B6%C3%BC+%26+mehr");
    });
  });

  describe("Absicherung gegen genau das Muster, das ERR_INVALID_URL ausgelöst hat", () => {
    it("ein Location-Header, wie ihn die vorherige fehlerhafte Fassung gesetzt hätte, wäre von der WHATWG-URL-Validierung ohne Basis abgelehnt worden", () => {
      // Dokumentiert die Ursache, unabhängig vom aktuellen Code: `new URL(location)` OHNE
      // zweites Argument (Basis) — genau das, was die Next.js-Edge-Laufzeit laut Stacktrace für
      // den Location-Header tut — wirft für einen relativen Wert wie
      // "/login?next=%2Fprofile" ERR_INVALID_URL. Ein absoluter Wert mit korrekter Origin
      // würde dagegen bestehen. Dieser Test hält fest, WARUM ein Location-Header aus der
      // Middleware grundsätzlich riskant bleibt, und damit, warum Weg A (kein Location-Header
      // mehr) und nicht nur "diesmal richtig absolut bauen" die robuste Wahl ist.
      const relativeLocation = "/login?next=%2Fprofile";

      expect(() => new URL(relativeLocation)).toThrow(/Invalid URL/);
    });
  });

  describe("Content-Security-Policy mit Nonce (Auftrag „HTTP-Sicherheitsheader und CSP mit Nonce“)", () => {
    function extractNonce(cspValue: string): string {
      const match = /'nonce-([^']*)'/.exec(cspValue);
      if (!match?.[1]) {
        throw new Error("Kein Nonce in der Content-Security-Policy gefunden — Testannahme verletzt.");
      }
      return match[1];
    }

    it("setzt die CSP als Request-Header (damit Next.js den Nonce für eigene Inline-Skripte lesen kann)", () => {
      const response = middleware(requestWithoutSession("/"));
      const forwardedCsp = response.headers.get("x-middleware-request-content-security-policy");

      expect(forwardedCsp).not.toBeNull();
      expect(forwardedCsp).toContain("nonce-");
    });

    it("setzt dieselbe CSP zusätzlich als Antwort-Header", () => {
      const response = middleware(requestWithoutSession("/"));
      const forwardedCsp = response.headers.get("x-middleware-request-content-security-policy");
      const responseCsp = response.headers.get("content-security-policy");

      expect(responseCsp).not.toBeNull();
      expect(responseCsp).toBe(forwardedCsp);
    });

    it("erzeugt bei jedem Aufruf einen neuen, unterschiedlichen Nonce", () => {
      const first = middleware(requestWithoutSession("/"));
      const second = middleware(requestWithoutSession("/"));
      const firstNonce = extractNonce(first.headers.get("content-security-policy") ?? "");
      const secondNonce = extractNonce(second.headers.get("content-security-policy") ?? "");

      expect(firstNonce).not.toBe(secondNonce);
      expect(firstNonce.length).toBeGreaterThan(0);
    });

    it("entspricht exakt buildContentSecurityPolicy(nonce, isProductionRuntime) mit dem tatsächlich erzeugten Nonce", () => {
      const response = middleware(requestWithoutSession("/login"));
      const responseCsp = response.headers.get("content-security-policy") ?? "";
      const nonce = extractNonce(responseCsp);

      expect(responseCsp).toBe(buildContentSecurityPolicy(nonce, isProductionRuntime));
    });

    it("liefert eine CSP unabhängig vom Sitzungs-Cookie-Zustand (öffentliche wie geschützte Pfade)", () => {
      const withoutSession = middleware(requestWithoutSession("/profile"));
      const withSession = middleware(requestWithSession("/profile"));

      expect(withoutSession.headers.get("content-security-policy")).toContain("nonce-");
      expect(withSession.headers.get("content-security-policy")).toContain("nonce-");
    });

    it("beschädigt den bestehenden x-pathname-Mechanismus nicht, wenn die CSP hinzukommt", () => {
      const response = middleware(requestWithoutSession("/wallet?tab=verlauf"));

      expect(response.headers.get("x-middleware-request-x-pathname")).toBe("/wallet?tab=verlauf");
      expect(response.headers.get("content-security-policy")).toContain("nonce-");
    });
  });

  describe("Matcher (config.matcher) schließt statische Auslieferung und /api aus", () => {
    it("exportiert einen Matcher als Zeichenkette mit Negativ-Lookahead für api, _next/static, _next/image, favicon.ico und Dateiendungen", async () => {
      const { config } = await import("./middleware");
      const source = config.matcher[0];
      if (source === undefined) {
        throw new Error("config.matcher ist leer — Testannahme verletzt.");
      }
      const pattern = new RegExp(`^${source}$`);

      const shouldMatch = ["/", "/login", "/register", "/wallet", "/wallet/verlauf", "/admin", "/spiele/roulette-europa"];
      const shouldNotMatch = ["/api/auth/session", "/api/auth/callback/google", "/_next/static/chunk.js", "/_next/image", "/favicon.ico", "/thumbs/roulette.svg", "/robots.txt"];

      for (const path of shouldMatch) {
        expect(pattern.test(path), `${path} sollte vom Matcher erfasst werden`).toBe(true);
      }
      for (const path of shouldNotMatch) {
        expect(pattern.test(path), `${path} sollte vom Matcher ausgeschlossen werden`).toBe(false);
      }
    });

    it("schließt weiterhin keine Weiterleitung ein (Matcher-Erweiterung ändert nichts an der Kernentscheidung dieser Datei)", () => {
      const response = middleware(requestWithoutSession("/"));

      expect(response.headers.get("location")).toBeNull();
      expect(response.status).toBeLessThan(300);
    });
  });
});
