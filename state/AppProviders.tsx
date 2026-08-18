"use client";

import type { ReactNode } from "react";
import type { Game } from "@/types/game";
import type { User } from "@/types/user";
import { ToastProvider } from "@/components/ui/Toast";
import { PersistenceProvider } from "./PersistenceContext";
import { SessionProvider } from "./SessionContext";
import { RgProvider } from "./RgContext";
import { CatalogProvider } from "./CatalogContext";
import { WalletProvider } from "./WalletContext";

/**
 * Reihenfolge ist relevant: Wallet braucht Session (userId) und RG (Sperre).
 *
 * `user` kommt aus app/layout.tsx (Server Component, server/auth/guards.ts::getSession()) —
 * SessionProvider gibt sie nur noch weiter, liest sie nicht mehr selbst aus LocalStorage.
 * Standardwert `null` (nicht angemeldet): hält AppProviders in bestehenden Komponententests
 * verwendbar, die nur einen generischen Provider-Baum brauchen und keine Sitzung simulieren
 * (z. B. components/game/**-Tests) — diese Dateien sind laut Auftrag nicht zu ändern.
 *
 * `initialGames` (optional, wie `user`): aus app/layout.tsx, dort über die Repositories aus der
 * Datenbank gelesen (server/catalog/read-model.ts). Ohne Prop fällt CatalogProvider auf
 * data/catalog.ts zurück — bestehende Tests bleiben dadurch unverändert lauffähig.
 */
export function AppProviders({ children, user = null, initialGames }: { children: ReactNode; user?: User | null; initialGames?: readonly Game[] }) {
  return (
    <ToastProvider>
      <PersistenceProvider>
        <SessionProvider user={user}>
          <RgProvider>
            <CatalogProvider initialGames={initialGames}>
              <WalletProvider>{children}</WalletProvider>
            </CatalogProvider>
          </RgProvider>
        </SessionProvider>
      </PersistenceProvider>
    </ToastProvider>
  );
}
