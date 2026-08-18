import type { NextConfig } from "next";

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

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Der Prototyp lädt keine externen Bilder; die Bildoptimierung wird nicht benötigt.
  images: { unoptimized: true },
  // `pg` bringt natives/optionales Bindings-Gepäck mit, das nicht ins Server-Bundle gehört —
  // Next lädt es stattdessen zur Laufzeit regulär über require() (server/db/client.ts, Phase 0).
  serverExternalPackages: ["pg"],
};

export default nextConfig;
