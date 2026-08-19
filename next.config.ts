import type { NextConfig } from "next";
import { buildStaticSecurityHeaders } from "./lib/security-headers";

/**
 * Nur Node.js-Server (`next start`). Statischer Export (`NEXT_OUTPUT=export`) ist nicht mehr möglich.
 *
 * Warum: Das Projekt läuft jetzt auf einem Fullstack-Stack mit PostgreSQL, better-auth (Sitzungen,
 * OAuth), Route Handlern (`app/api/auth/[...all]/route.ts`) und Middleware (`middleware.ts`).
 * Alle drei sind im statischen Export nicht unterstützt — Next.js kann beim Export weder Route
 * Handler noch Middleware einbinden und kann die Seiten deshalb nicht generieren.
 * Historischer Grund für `NEXT_OUTPUT=export`: Der ursprüngliche Prototyp war rein clientseitig
 * (nur localStorage, kein Backend). Damit waren alle Seiten statisch generierbar.
 */

/**
 * Eine von zwei Stellen außerhalb von lib/env.ts, an denen `process.env` gelesen werden darf
 * (siehe ESLint-Ausnahmeliste in eslint.config.mjs; die zweite ist middleware.ts). `lib/env.ts`
 * selbst scheidet für diesen Zweck aus (siehe Auftrag „HTTP-Sicherheitsheader und CSP mit
 * Nonce“): Es importiert "server-only" und validiert beim Import die volle Laufzeitkonfiguration
 * (DATABASE_URL, BETTER_AUTH_SECRET, …) — ein Import allein für ein Produktions-Flag würde diese
 * Validierung unnötig an die Edge-Middleware koppeln und dort bei fehlender
 * Datenbank-Konfiguration hart fehlschlagen.
 *
 * Bewusst NICHT exportiert und NICHT von middleware.ts importiert (frühere Fassung, siehe
 * Git-Historie): Ein Import hätte das separat kompilierte Edge-Bundle von middleware.ts an diese
 * Datei gekoppelt — sobald hier künftig ein Node-spezifisches Modul dazukommt
 * (Bundle-Analyzer, Sentry, `fs`-Zugriff), bricht dadurch der Build oder die Laufzeit der
 * Middleware, ohne dass sie selbst je etwas mit diesem Modul zu tun hätte. middleware.ts liest
 * `process.env.NODE_ENV` deshalb jetzt direkt und eigenständig (dort mit identischer Begründung
 * kommentiert) — das liefert denselben Wert, weil `process.env.NODE_ENV` von Next.js/webpack für
 * jedes Kompilierziel (Node-Server, Edge-Laufzeit) separat und statisch durch den tatsächlichen
 * Wert ersetzt wird (Kompilierzeit-Konstante, kein zur Laufzeit geteilter Prozess-Zustand).
 */
const isProductionRuntime: boolean = process.env.NODE_ENV === "production";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Der Prototyp lädt keine externen Bilder; die Bildoptimierung wird nicht benötigt.
  images: { unoptimized: true },
  // `pg` bringt natives/optionales Bindings-Gepäck mit, das nicht ins Server-Bundle gehört —
  // Next lädt es stattdessen zur Laufzeit regulär über require() (server/db/client.ts, Phase 0).
  serverExternalPackages: ["pg"],
  // Entfernt den Antwort-Header `X-Powered-By: Next.js` — er verrät unnötig Implementierungsdetails.
  poweredByHeader: false,
  // Statische Sicherheitsheader für alle Seitenpfade. Die Content-Security-Policy gehört bewusst
  // NICHT hierher: headers() wird einmal beim Start ausgewertet, ein Nonce muss aber pro Anfrage
  // neu sein — das leistet middleware.ts (siehe dortiger Kommentar zum Next.js-15-CSP-Muster).
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: buildStaticSecurityHeaders(isProductionRuntime),
      },
    ];
  },
};

export default nextConfig;
