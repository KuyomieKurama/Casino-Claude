import { NextResponse, type NextRequest } from "next/server";
import { buildContentSecurityPolicy } from "@/lib/security-headers";

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
 *
 * CONTENT-SECURITY-POLICY MIT NONCE (Auftrag „HTTP-Sicherheitsheader und CSP mit Nonce“): Reines
 * Durchreichen bleibt weiterhin die einzige Aufgabe dieser Datei — es kommt hier NICHTS an
 * Autorisierungs- oder Weiterleitungslogik hinzu. Die CSP ist reines Response-Header-Plumbing,
 * dieselbe Kategorie wie x-pathname oben, nur mit einem pro Anfrage neuen Zufallswert (Nonce)
 * statt eines abgeleiteten Werts aus der URL. Nach dem für Next.js 15 dokumentierten Muster wird
 * der Nonce sowohl als Request-Header `content-security-policy` gesetzt (Next.js liest ihn dort
 * selbst aus und stempelt ihn auf seine eigenen <script>-Elemente, siehe
 * node_modules/next/dist/server/app-render/app-render.js) als auch auf der Antwort — ohne den
 * Request-Header würde Next.js den Nonce nicht auf eigene Inline-Skripte anwenden und die Seite
 * bräche an der eigenen CSP.
 *
 * Produktions- vs. Entwicklungs-Policy — `process.env.NODE_ENV` wird HIER DIREKT gelesen, nicht
 * mehr über einen Import aus next.config.ts (frühere Fassung, siehe Git-Historie):
 *
 * Der Import koppelte das separat kompilierte Edge-Bundle dieser Datei an next.config.ts. Sobald
 * next.config.ts künftig ein Node-spezifisches Modul zieht (Bundle-Analyzer, Sentry,
 * `fs`-Zugriff o. Ä.), würde dieser Import versuchen, dasselbe Modul ins Edge-Bundle zu ziehen —
 * dort bricht entweder der Build oder die Laufzeit, ohne dass die Middleware selbst je etwas mit
 * diesem Modul zu tun hätte. Das ist ein struktureller Kopplungsfehler, kein hypothetisches
 * Risiko: next.config.ts darf beliebige Node-Plugins einbinden, middleware.ts nicht.
 *
 * Der direkte `process.env.NODE_ENV`-Zugriff hier ist trotz der Schichtregel ("process.env nur
 * in lib/env.ts") zulässig, weil middleware.ts dafür explizit auf der Ausnahmeliste dieser Regel
 * steht (siehe eslint.config.mjs, `noProcessEnvOutsideEnvModule`, dieselbe Ausnahme wie
 * next.config.ts). Die Begründung ist identisch zu next.config.ts: `lib/env.ts` scheidet aus, weil
 * es "server-only" importiert und beim Import die volle Laufzeitkonfiguration (DATABASE_URL,
 * BETTER_AUTH_SECRET, …) validiert — ungeeignet, nur um ein Produktions-Flag in der
 * Edge-Middleware zu lesen. Der Zugriff ist unbedenklich, weil `process.env.NODE_ENV` von
 * Next.js/webpack für jedes Kompilierziel (Node-Server, Edge-Laufzeit) separat und STATISCH durch
 * den tatsächlichen Wert ersetzt wird (Kompilierzeit-Konstante, kein zur Laufzeit gelesener,
 * potenziell fehlender Prozess-Zustand) — genau das unterscheidet diesen Fall von den übrigen
 * Umgebungsvariablen, die zu Recht ausschließlich über lib/env.ts laufen.
 */
export function middleware(request: NextRequest): NextResponse {
  const forwardedHeaders = new Headers(request.headers);
  forwardedHeaders.set("x-pathname", request.nextUrl.pathname + request.nextUrl.search);

  // Web-Crypto-API (global `crypto`, kein `node:crypto`) — das ist die einzige Zufallsquelle,
  // die in der Edge-Runtime garantiert verfügbar ist (dokumentiertes Next.js-15-Muster).
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const contentSecurityPolicy = buildContentSecurityPolicy(nonce, process.env.NODE_ENV === "production");
  forwardedHeaders.set("content-security-policy", contentSecurityPolicy);

  const response = NextResponse.next({ request: { headers: forwardedHeaders } });
  response.headers.set("content-security-policy", contentSecurityPolicy);
  return response;
}

export const config = {
  /**
   * Alle Seitenpfade bekommen eine CSP mit Nonce (Auftrag „HTTP-Sicherheitsheader und CSP mit
   * Nonce“) — nicht mehr nur die geschützten Nutzerpfade wie zuvor. Ausgeschlossen bleibt, was
   * keine HTML-Seite ausliefert und keinen Nonce braucht:
   *  - /api/**        — liefert JSON, läuft bewusst nicht durch diese Middleware (siehe oben).
   *  - /_next/static/* — vorgebaute, unveränderliche Assets.
   *  - /_next/image    — Bildoptimierungs-Endpunkt, liefert Bilddaten, keine HTML-Seite.
   *  - favicon.ico     — statische Datei.
   *  - Pfade mit Dateiendung (z. B. /thumbs/*.svg) — statische Assets, keine Seiten.
   * Der bisherige Schutz der Nutzerpfade (/wallet, /history, /profile, /favorites, /settings,
   * /bonuses, /security, /admin) verschlechtert sich dadurch nicht: Sie sind weiterhin
   * eingeschlossen, jetzt zusätzlich zu allen anderen Seitenpfaden (Lobby, Login, Registrierung).
   */
  matcher: ["/((?!api/|_next/static/|_next/image|favicon\\.ico|.*\\.[a-zA-Z0-9]+$).*)"],
};
