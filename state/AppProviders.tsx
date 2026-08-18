"use client";

import type { ReactNode } from "react";
import type { Game } from "@/types/game";
import type { User } from "@/types/user";
import type { WalletBalance } from "@/types/wallet";
import type { ResponsibleGaming } from "@/types/responsible-gaming";
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
 *
 * `walletSnapshot` (optional, wie `initialGames`): aus app/layout.tsx, dort über
 * server/wallet/wallet-read-model.ts gelesen. Ohne Prop verhält sich WalletProvider wie vor
 * dieser Änderung (hartkodierter Default plus LocalStorage) — bestehende Tests, die nur
 * `<AppProviders>` ohne Server-Kontext brauchen, bleiben unverändert lauffähig.
 *
 * `rgSnapshot` (optional, wie `walletSnapshot`): aus app/layout.tsx, dort über
 * server/rg/rg-read-model.ts gelesen. Ohne Prop startet RgProvider mit dem Standardzustand eines
 * brandneuen Nutzers (keine Sperre, kein Limit) — bestehende Tests bleiben unverändert lauffähig.
 */
export function AppProviders({
  children,
  user = null,
  initialGames,
  walletSnapshot,
  rgSnapshot,
}: {
  children: ReactNode;
  user?: User | null;
  initialGames?: readonly Game[];
  walletSnapshot?: WalletBalance;
  rgSnapshot?: ResponsibleGaming;
}) {
  return (
    <ToastProvider>
      <PersistenceProvider>
        <SessionProvider user={user}>
          <RgProvider initialRg={rgSnapshot}>
            <CatalogProvider initialGames={initialGames}>
              <WalletProvider initialWallet={walletSnapshot}>{children}</WalletProvider>
            </CatalogProvider>
          </RgProvider>
        </SessionProvider>
      </PersistenceProvider>
    </ToastProvider>
  );
}
