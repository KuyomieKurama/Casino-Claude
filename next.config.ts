import type { NextConfig } from "next";

/**
 * Zwei Auslieferungsarten, über eine Umgebungsvariable umschaltbar:
 *
 *   npm run build            → Node-Server (`next start`), Standard
 *   NEXT_OUTPUT=export …     → statischer Export nach `out/`, komplett ohne Node zur Laufzeit
 *
 * Der statische Export ist möglich, weil dieser Prototyp ausschließlich im Browser läuft:
 * keine Server Actions, keine Route Handler, keine Middleware, kein Backend. Alle Seiten sind
 * statisch oder über `generateStaticParams` vorgerendert.
 */
const isExport = process.env.NEXT_OUTPUT === "export";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Der Prototyp lädt keine externen Bilder; die Bildoptimierung wird nicht benötigt.
  // Für den statischen Export ist sie ohnehin nicht verfügbar.
  images: { unoptimized: true },
  // `pg` bringt natives/optionales Bindings-Gepäck mit, das nicht ins Server-Bundle gehört —
  // Next lädt es stattdessen zur Laufzeit regulär über require() (server/db/client.ts, Phase 0).
  serverExternalPackages: ["pg"],
  ...(isExport
    ? {
        output: "export" as const,
        // Erzeugt `pfad/index.html` statt `pfad.html`. Damit liefert jeder gewöhnliche Webserver
        // die Seiten ohne Rewrite-Regeln korrekt aus.
        trailingSlash: true,
      }
    : {}),
};

export default nextConfig;
