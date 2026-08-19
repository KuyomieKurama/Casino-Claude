import { NextResponse, type NextRequest } from "next/server";

/**
 * Middleware, Edge-Runtime: reines Plumbing. Trifft WEDER eine Autorisierungsentscheidung NOCH
 * eine Weiterleitung. Reicht jeden Request unverändert durch und ergänzt nur einen Header, den
 * Server Components sonst nicht bekommen könnten (siehe unten).
 *
 * VORGESCHICHTE — warum hier bewusst NICHTS mehr passiert außer Durchreichen:
 *
 * Frühere Fassungen leiteten bei fehlendem Session-Cookie selbst nach /login um und bauten dafür
 * den Location-Header hier in der Middleware:
 *
 *   1. Erst absolut aus `request.url` / `request.nextUrl.origin`: das erbt hinter einem Reverse
 *      Proxy IMMER die interne Origin von `next start -H 127.0.0.1`
 *      (__NEXT_PRIVATE_ORIGIN, node_modules/next/dist/server/lib/start-server.js) und leitete
 *      Nutzer fälschlich auf `https://localhost:3000` statt auf die tatsächlich aufgerufene
 *      Domain um.
 *   2. Als Korrektur relativ per roher `NextResponse` mit selbst gesetztem Location-Header
 *      (`NextResponse.redirect()` verlangt ohnehin eine absolute URL und schied damit aus):
 *      das ließ `next start` in Produktion bei JEDEM Aufruf eines geschützten Pfads mit
 *      `TypeError: Invalid URL` (ERR_INVALID_URL) abstürzen. Grund: die Next.js-Edge-Laufzeit
 *      validiert den Location-Header jeder aus der Middleware zurückgegebenen Response selbst
 *      gegen eine absolute URL (`new URL(location)`, ohne Basis) — unabhängig davon, ob
 *      `NextResponse.redirect()` oder eine rohe `NextResponse` mit manuell gesetztem
 *      Location-Header verwendet wird. Der ursprüngliche Test dieser Datei hat das nicht
 *      gefunden, weil er die exportierte Funktion direkt aufrief und den Rückgabewert prüfte —
 *      diese Validierung findet aber erst beim tatsächlichen Ausliefern der Response durch die
 *      Next.js-Laufzeit statt, nicht im Rückgabewert der Funktion selbst.
 *
 * Beide Varianten scheitern strukturell daran, dass der Middleware kein sicher verfügbarer,
 * vertrauenswürdiger absoluter Origin-Wert zur Verfügung steht: `BETTER_AUTH_URL` liegt in
 * `lib/env.ts` (server-only, in der Edge-Runtime nicht nutzbar) und dürfte laut ESLint-Regel
 * ohnehin nirgends sonst per `process.env` gelesen werden; `Host`- bzw.
 * `X-Forwarded-Host`-Header sind clientseitig fälschbar und ohne Allowlist-Prüfung ein
 * Host-Header-Injection-Risiko. Die einzige robuste Lösung: die Middleware trifft gar keine
 * Weiterleitungsentscheidung mehr — das beseitigt die gesamte Fehlerklasse, statt sie zu
 * umschiffen. Das ist ohnehin nur konsequent: die Middleware durfte laut ihrem eigenen früheren
 * Kommentar schon vorher keine Autorisierungsentscheidung treffen (kein Datenbankzugriff in der
 * Edge-Runtime, ein vorhandenes Cookie kann abgelaufen oder widerrufen sein), war also immer nur
 * ein optimistischer Vorab-Check ohne eigene Aussagekraft.
 *
 * Die eigentliche, verlässliche Prüfung (echter Datenbankzugriff über server/auth/guards.ts,
 * requireUser()/requireAdmin()) findet jetzt ausschließlich in app/(user)/layout.tsx und jeder
 * app/admin/*-Seite statt. Diese leiten bei fehlender/ungültiger Sitzung selbst über
 * `redirect()` aus `next/navigation` um — das läuft nicht über die oben beschriebene
 * Edge-Response-Validierung und akzeptiert relative Ziele (`app/(user)/layout.test.tsx`,
 * `app/admin/page.test.tsx` u. a. laufen unverändert grün und sind vom Origin-Fehler
 * nachweislich nicht betroffen).
 *
 * x-pathname: Server Components haben keinen Zugriff auf den aktuellen Anfrage-Pfad (nur die
 * Middleware sieht `request.nextUrl`). app/(user)/layout.tsx braucht ihn, um bei fehlender
 * Sitzung mit `?next=<pfad>` weiterzuleiten. Wird jetzt IMMER gesetzt (früher nur, wenn ein
 * Cookie vorhanden war) — die Middleware unterscheidet ja nicht mehr zwischen beiden Fällen,
 * sie reicht in jedem Fall nur durch.
 */
export function middleware(request: NextRequest): NextResponse {
  const forwardedHeaders = new Headers(request.headers);
  forwardedHeaders.set("x-pathname", request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.next({ request: { headers: forwardedHeaders } });
}

export const config = {
  /**
   * Nur die (user)-Routengruppe (eingeloggte Bereiche, siehe CLAUDE.md) sowie /admin schützen.
   * Öffentliche Seiten (Lobby, Login, Registrierung, /api/auth/*) bleiben unangetastet — sonst
   * würde die Middleware den Login selbst blockieren.
   */
  matcher: ["/wallet/:path*", "/history/:path*", "/profile/:path*", "/favorites/:path*", "/settings/:path*", "/bonuses/:path*", "/security/:path*", "/admin/:path*"],
};
