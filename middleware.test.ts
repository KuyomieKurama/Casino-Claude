import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { middleware } from "./middleware";
import { safeNext } from "@/lib/safe-redirect";

/**
 * Regressionstests für den Produktionsfehler „Weiterleitung nach https://localhost:3000 statt
 * auf die aufgerufene Domain hinter einem Reverse Proxy". Ursache war eine absolute
 * `Location`-URL, gebaut aus `request.url` (erbt bei `next start -H 127.0.0.1` intern
 * `http://localhost:3000`, siehe node_modules/next/dist/server/lib/start-server.js). Die
 * Simulation unten baut die Requests bewusst mit dieser internen Origin (`http://localhost:3000`)
 * und abweichenden Host-/X-Forwarded-Host-Headern nach, um exakt das Produktionsszenario
 * nachzustellen: die Middleware darf den Header niemals wieder aus request.url/nextUrl.origin
 * ableiten.
 */

const INTERNAL_ORIGIN = "http://localhost:3000";

function requestWithoutSession(path: string, extraHeaders: Record<string, string> = {}): NextRequest {
  return new NextRequest(new URL(path, INTERNAL_ORIGIN), { headers: extraHeaders });
}

function requestWithSession(path: string): NextRequest {
  return new NextRequest(new URL(path, INTERNAL_ORIGIN), {
    headers: { cookie: "better-auth.session_token=fixture-token" },
  });
}

describe("middleware", () => {
  describe("Weiterleitung ohne Sitzung", () => {
    it("liefert einen relativen Location-Header statt einer absoluten URL (Regressionstest)", () => {
      const response = middleware(requestWithoutSession("/profile"));

      expect(response.status).toBe(307);
      const location = response.headers.get("location");
      expect(location).toBe("/login?next=%2Fprofile");
      expect(location).not.toContain("localhost");
      expect(location).not.toMatch(/^https?:\/\//);
      expect(location?.startsWith("/")).toBe(true);
    });

    it("erhält den next-Parameter mit Pfad und Query-String, korrekt kodiert", () => {
      const response = middleware(requestWithoutSession("/history?foo=bar&baz=1"));

      const location = response.headers.get("location");
      expect(location).not.toBeNull();
      const params = new URLSearchParams(location!.split("?")[1]);
      expect(params.get("next")).toBe("/history?foo=bar&baz=1");
    });

    it("kodiert Sonderzeichen (Leerzeichen, Unicode, Sonderzeichen) im next-Parameter korrekt", () => {
      const url = new URL("/wallet", INTERNAL_ORIGIN);
      url.searchParams.set("query", "hallo welt äöü & mehr");
      const response = middleware(requestWithoutSession(url.pathname + url.search));

      const location = response.headers.get("location");
      const params = new URLSearchParams(location!.split("?")[1]);
      expect(params.get("next")).toBe("/wallet?query=hallo+welt+%C3%A4%C3%B6%C3%BC+%26+mehr");
    });

    it("ändert das Ziel NICHT, wenn ein Host-Header manipuliert wird", () => {
      const baseline = middleware(requestWithoutSession("/profile")).headers.get("location");
      const manipulated = middleware(requestWithoutSession("/profile", { host: "evil.example.com" })).headers.get("location");

      expect(manipulated).toBe(baseline);
      expect(manipulated).not.toContain("evil.example.com");
    });

    it("ändert das Ziel NICHT, wenn X-Forwarded-Host manipuliert wird", () => {
      const baseline = middleware(requestWithoutSession("/profile")).headers.get("location");
      const manipulated = middleware(
        requestWithoutSession("/profile", { "x-forwarded-host": "evil.example.com" }),
      ).headers.get("location");

      expect(manipulated).toBe(baseline);
      expect(manipulated).not.toContain("evil.example.com");
    });

    it("ändert das Ziel NICHT, wenn Host UND X-Forwarded-Host gleichzeitig auf die echte Produktionsdomain gesetzt sind", () => {
      // Auch der „echte", im Fehlerbericht genannte Domainname darf die Middleware nicht dazu
      // bringen, ihn in die Location zu übernehmen — die Middleware ignoriert Host-Header
      // grundsätzlich (siehe Kommentar in middleware.ts, warum X-Forwarded-Host kein
      // vertrauenswürdiger Ersatz ist).
      const response = middleware(
        requestWithoutSession("/profile", {
          host: "velora.hokusfuckingpokus.de",
          "x-forwarded-host": "velora.hokusfuckingpokus.de",
        }),
      );

      expect(response.headers.get("location")).toBe("/login?next=%2Fprofile");
    });

    it("liefert für jeden geschützten Pfad aus dem Matcher einen relativen Location-Header", () => {
      const protectedPaths = ["/wallet", "/history", "/profile", "/favorites", "/settings", "/bonuses", "/security", "/admin"];

      for (const path of protectedPaths) {
        const location = middleware(requestWithoutSession(path)).headers.get("location");
        expect(location, `Pfad ${path}`).toMatch(/^\/login\?next=/);
      }
    });

    it("bleibt mit der bestehenden Absicherung gegen offene Weiterleitungen (safeNext) kompatibel", () => {
      const location = middleware(requestWithoutSession("/profile")).headers.get("location")!;
      const next = new URLSearchParams(location.split("?")[1]).get("next");

      // safeNext() muss den von der Middleware erzeugten next-Wert unverändert durchlassen —
      // er ist per Konstruktion bereits ein sicherer, relativer Pfad ohne fremde Origin.
      expect(safeNext(next)).toBe(next);
    });

    it("erzeugt auch bei einem doppelten Schrägstrich innerhalb des Pfads keinen von safeNext abgewiesenen Wert", () => {
      // Nur ein FÜHRENDER doppelter Schrägstrich ist protokollrelativ und gefährlich
      // (siehe lib/safe-redirect.ts); ein doppelter Schrägstrich mitten im Pfad ist harmlos.
      const response = middleware(requestWithoutSession("/profile/foo//bar"));
      const location = response.headers.get("location")!;
      const next = new URLSearchParams(location.split("?")[1]).get("next");

      expect(next).toBe("/profile/foo//bar");
      expect(safeNext(next)).toBe(next);
    });
  });

  describe("Durchlass mit vorhandenem Session-Cookie", () => {
    it("leitet nicht weiter und reicht den ursprünglichen Pfad als x-pathname-Header weiter", () => {
      const response = middleware(requestWithSession("/profile?tab=sicherheit"));

      expect(response.headers.get("location")).toBeNull();
      expect(response.headers.get("x-middleware-next")).toBe("1");
      expect(response.headers.get("x-middleware-request-x-pathname")).toBe("/profile?tab=sicherheit");
    });
  });
});
