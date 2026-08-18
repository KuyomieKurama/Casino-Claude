import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

/**
 * Middleware, Edge-Runtime: prüft AUSSCHLIESSLICH, ob überhaupt ein Session-Cookie vorhanden
 * ist, und leitet sonst nach `/login?next=…` um.
 *
 * WARNUNG AN KÜNFTIGE ÄNDERUNGEN: Hier darf NIEMALS Autorisierungslogik (Rollenprüfung,
 * Sperrstatus, Admin-Check o. Ä.) ergänzt werden. Die Middleware läuft auf der Edge-Runtime
 * ohne Datenbankzugriff — sie kann `role`/`status` gar nicht verlässlich prüfen, sondern nur
 * `getSessionCookie()` (reine Cookie-Präsenzprüfung, kein Sitzungsabgleich mit der Datenbank,
 * siehe node_modules/better-auth/dist/cookies/index.d.mts). Ein hier "bestandener" Nutzer kann
 * eine längst widerrufene oder abgelaufene Sitzung haben. Die eigentliche Prüfung passiert in
 * server/auth/guards.ts (requireUser/requireAdmin) in Server Components und Route Handlern, wo
 * ein echter Datenbankzugriff möglich ist.
 */
export function middleware(request: NextRequest): NextResponse {
  const hasSessionCookie = Boolean(getSessionCookie(request));
  if (hasSessionCookie) {
    // Reine Plumbing-Ergänzung, KEINE Autorisierungslogik (siehe Warnung oben): app/(user)/layout.tsx
    // und app/admin/page.tsx prüfen die Sitzung serverseitig erneut (server/auth/guards.ts, echter
    // Datenbankzugriff) und brauchen dafür den ursprünglich angefragten Pfad, um bei einer dort
    // erkannten ungültigen Sitzung (Cookie vorhanden, aber abgelaufen/widerrufen) ebenfalls mit
    // `?next=<pfad>` weiterleiten zu können. Server Components haben sonst keinen Zugriff auf den
    // aktuellen Pfad — deshalb hier als Request-Header weitergereicht, denselben Wert, den die
    // Middleware unten ohnehin schon für ihre eigene Weiterleitung berechnet.
    const forwardedHeaders = new Headers(request.headers);
    forwardedHeaders.set("x-pathname", request.nextUrl.pathname + request.nextUrl.search);
    return NextResponse.next({ request: { headers: forwardedHeaders } });
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  /**
   * Nur die (user)-Routengruppe (eingeloggte Bereiche, siehe CLAUDE.md) sowie /admin schützen.
   * Öffentliche Seiten (Lobby, Login, Registrierung, /api/auth/*) bleiben unangetastet — sonst
   * würde die Middleware den Login selbst blockieren.
   */
  matcher: ["/wallet/:path*", "/history/:path*", "/profile/:path*", "/favorites/:path*", "/settings/:path*", "/bonuses/:path*", "/security/:path*", "/admin/:path*"],
};
