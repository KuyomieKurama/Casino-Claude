import type { Metadata, Viewport } from "next";
import { Fraunces, Inter } from "next/font/google";
import "./globals.css";
import { PRODUCT_NAME } from "@/lib/constants";
import type { User } from "@/types/user";
import { AppProviders } from "@/state/AppProviders";
import { Header } from "@/components/layout/Header";
import { BottomNavigation } from "@/components/layout/BottomNavigation";
import { Footer } from "@/components/layout/Footer";
import { SystemNotices } from "@/components/layout/SystemNotices";
import { getSession, type AuthSession } from "@/server/auth/guards";
import { db } from "@/server/db/client";
import { loadLobbyGames } from "@/server/catalog/read-model";
import { resolveWalletBalance } from "@/server/wallet/wallet-read-model";
import { resolveResponsibleGaming } from "@/server/rg/rg-read-model";

// E2: Fraunces (Serif) als Display-Akzent, Inter für Body/UI. Selbst gehostet über next/font — keine Requests zur Laufzeit.
const fraunces = Fraunces({
  subsets: ["latin"],
  axes: ["SOFT", "WONK", "opsz"],
  variable: "--font-fraunces",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: PRODUCT_NAME, template: `%s · ${PRODUCT_NAME}` },
  description: "Casino-Lobby mit Spielwährung ohne Geldwert. Kein Echtgeldspiel, keine Auszahlungen.",
  // Konzept A7: öffentlich erreichbar deployt → nicht indexieren.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#0B0D10",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

/** Bildet die Serversitzung (server/auth/guards.ts) auf den schlanken Client-Typ ab (types/user.ts)
 *  — state/** und components/** dürfen laut Schichtregel nichts aus @/server/* importieren,
 *  diese Abbildung passiert deshalb ausschließlich hier, bevor die Daten als Prop in den
 *  Client-Baum wandern. */
function toClientUser(session: AuthSession | null): User | null {
  if (!session) return null;
  return {
    id: session.user.id,
    displayName: session.user.name,
    email: session.user.email,
    role: session.user.role === "admin" ? "admin" : "user",
    isGuest: session.user.isGuest,
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Katalog serverseitig über die Repositories lesen (Auftrag §1) — derselbe Rhythmus wie
  // getSession() oben: einmal pro Anfrage im Root-Layout, dann als fertige Daten (kein
  // @/server/*-Import) in den Client-Baum gereicht. Speist Lobby, Startseite und die
  // "Ähnliche Spiele"-Liste der Detailseite über CatalogContext.
  //
  // Versteckte Abhängigkeit (Befund „Nonce hängt an durchgehend dynamischem Rendering"): Dieser
  // await macht JEDE Seite dynamisch (kein Caching, keine statische Generierung), weil ein
  // Datenbankzugriff pro Anfrage per Definition nicht vorab berechenbar ist. Genau das hält
  // aktuell auch das Nonce-Muster der CSP zusammen (middleware.ts erzeugt pro Anfrage einen
  // neuen Nonce, der eingebettete Nonce in der ausgelieferten Seite muss mit dem Header-Nonce
  // übereinstimmen): Würde eine Seite künftig statisch gecacht (z. B. durch Entfernen dieses
  // Aufrufs oder durch `export const dynamic = "force-static"`), liefe der eingebettete Nonce
  // aus dem Cache-Zeitpunkt dem aktuellen Header-Nonce auseinander, und die Hydration bräche an
  // der eigenen CSP. Wer dieses `await getSession()` entfernt oder die Dynamik dieses Layouts
  // sonst wie aufhebt, muss das CSP-Nonce-Muster (middleware.ts) neu bewerten.
  const session = await getSession();
  // resolveWalletBalance() braucht die (evtl. fehlende) userId aus getSession() — deshalb erst
  // NACH der Sitzung aufgerufen, aber weiterhin parallel zum unabhängigen Katalog-Read. Für
  // Gäste ohne Sitzung (session === null) liefert sie ohne Datenbankzugriff das dokumentierte
  // Startguthaben (server/wallet/wallet-read-model.ts) — kein Fehler, kein Sonderfall hier.
  const [initialGames, walletSnapshot, rgSnapshot] = await Promise.all([
    loadLobbyGames(db),
    resolveWalletBalance(db, session?.user.id ?? null),
    resolveResponsibleGaming(db, session?.user.id ?? null),
  ]);
  const user = toClientUser(session);
  return (
    <html lang="de" className={`${fraunces.variable} ${inter.variable}`}>
      <body className="min-h-dvh bg-base text-primary antialiased">
        <a href="#main" className="skip-link">
          Zum Inhalt springen
        </a>
        <AppProviders user={user} initialGames={initialGames} walletSnapshot={walletSnapshot} rgSnapshot={rgSnapshot}>
          <Header />
          <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[1536px] px-4 pb-[calc(var(--bottom-nav-height)+env(safe-area-inset-bottom))] sm:px-6 md:pb-0">
            {children}
          </main>
          <Footer />
          <BottomNavigation />
          <SystemNotices />
        </AppProviders>
      </body>
    </html>
  );
}
