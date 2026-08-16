import type { Metadata, Viewport } from "next";
import { Fraunces, Inter } from "next/font/google";
import "./globals.css";
import { PRODUCT_NAME } from "@/lib/constants";
import { AppProviders } from "@/state/AppProviders";
import { DemoBanner } from "@/components/layout/DemoBanner";
import { Header } from "@/components/layout/Header";
import { BottomNavigation } from "@/components/layout/BottomNavigation";
import { Footer } from "@/components/layout/Footer";
import { SystemNotices } from "@/components/layout/SystemNotices";

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
  description: "Klickbarer Prototyp einer Casino-Lobby mit simuliertem Guthaben. Kein Echtgeldspiel, keine Auszahlungen.",
  // Konzept A7: öffentlich erreichbar deployt → nicht indexieren.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#0B0D10",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" className={`${fraunces.variable} ${inter.variable}`}>
      <body className="min-h-dvh bg-base text-primary antialiased">
        <a href="#main" className="skip-link">
          Zum Inhalt springen
        </a>
        <AppProviders>
          <DemoBanner />
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
