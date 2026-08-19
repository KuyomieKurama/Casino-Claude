/**
 * Reine, testbare Bausteine für HTTP-Sicherheitsheader und die Content-Security-Policy (CSP).
 *
 * Bewusst ohne process.env-Zugriff: Diese Datei liegt unter lib/** und ist damit weder von der
 * ESLint-Ausnahmeliste noch von lib/env.ts erfasst — Aufrufer (next.config.ts, middleware.ts)
 * übergeben das Umgebungsflag `isProduction` explizit als Parameter. Das hält die Schichtregel
 * ein (lib/ enthält keine Umgebungslogik) und macht Produktions- und Entwicklungsvariante ohne
 * Umgebungsmanipulation direkt gegeneinander testbar (siehe security-headers.test.ts).
 */

export interface StaticSecurityHeader {
  key: string;
  value: string;
}

/**
 * Baut die Content-Security-Policy als einzeiligen Header-Wert (Semikolon-getrennt, keine
 * Zeilenumbrüche — ein Header-Wert darf keine Steuerzeichen enthalten).
 *
 * script-src bleibt in Produktion ohne 'unsafe-inline' und ohne 'unsafe-eval': Nur der pro
 * Anfrage erzeugte Nonce (middleware.ts) und 'strict-dynamic' erlauben von Next.js selbst
 * injizierte Skripte (dokumentiertes Next.js-15-Muster, siehe Kommentar in middleware.ts). In
 * der Entwicklung kommt 'unsafe-eval' hinzu, weil der Next-Dev-Server (Fast Refresh) auf
 * eval-basierte Sourcemaps setzt, die sonst von der CSP blockiert würden.
 *
 * style-src bleibt mit 'unsafe-inline' — bewusst in Produktion UND Entwicklung gleich: Sechs
 * Stellen im Code setzen dynamische style-Attribute (Animationsverzögerung, Rasterspalten,
 * Positionen, Kategoriefarbe; siehe CLAUDE.md/ENGINE-BRIEF.md), und die CSP kennt für
 * Attribut-Styles (im Gegensatz zu <style>-Blöcken oder <script>-Elementen) keinen Nonce. Genau
 * deshalb bleibt script-src umso strenger: dort ist 'unsafe-inline' konsequent verboten, die
 * Lockerung ist auf style-src begrenzt.
 *
 * upgrade-insecure-requests fehlt in der Entwicklung mit Absicht: Der Next-Dev-Server läuft
 * lokal nur über http://localhost. Eine erzwungene Umleitung auf https wäre dort nicht
 * erreichbar (kein TLS-Zertifikat auf dem Dev-Port) und würde jede Anfrage brechen — dieselbe
 * Begründung wie bei Strict-Transport-Security in next.config.ts.
 */
export function buildContentSecurityPolicy(nonce: string, isProduction: boolean): string {
  const scriptSrc = isProduction ? `'self' 'nonce-${nonce}' 'strict-dynamic'` : `'self' 'nonce-${nonce}' 'strict-dynamic' 'unsafe-eval'`;

  const directives = [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isProduction ? ["upgrade-insecure-requests"] : []),
  ];

  return directives.join("; ");
}

/**
 * Statische Header, die next.config.ts über headers() für alle Seitenpfade ausliefert. CSP und
 * Nonce gehören bewusst nicht hierher: next.config.ts.headers() wird einmalig beim Start
 * ausgewertet, ein Nonce muss aber pro Anfrage neu sein — das kann nur middleware.ts leisten
 * (siehe buildContentSecurityPolicy() dort verwendet).
 */
export function buildStaticSecurityHeaders(isProduction: boolean): StaticSecurityHeader[] {
  const headers: StaticSecurityHeader[] = [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  ];

  // Nur in Produktion: HSTS würde in der Entwicklung localhost dauerhaft auf https zwingen und
  // damit den lokalen Next-Dev-Server (nur http://) unerreichbar machen.
  if (isProduction) {
    headers.push({ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" });
  }

  return headers;
}
