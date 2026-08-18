"use client";

import type { ReactNode } from "react";
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
 */
export function AppProviders({ children, user = null }: { children: ReactNode; user?: User | null }) {
  return (
    <ToastProvider>
      <PersistenceProvider>
        <SessionProvider user={user}>
          <RgProvider>
            <CatalogProvider>
              <WalletProvider>{children}</WalletProvider>
            </CatalogProvider>
          </RgProvider>
        </SessionProvider>
      </PersistenceProvider>
    </ToastProvider>
  );
}
