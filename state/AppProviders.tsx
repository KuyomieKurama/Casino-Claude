"use client";

import type { ReactNode } from "react";
import { ToastProvider } from "@/components/ui/Toast";
import { PersistenceProvider } from "./PersistenceContext";
import { SessionProvider } from "./SessionContext";
import { RgProvider } from "./RgContext";
import { CatalogProvider } from "./CatalogContext";
import { WalletProvider } from "./WalletContext";

/** Reihenfolge ist relevant: Wallet braucht Session (userId) und RG (Sperre). */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <PersistenceProvider>
        <SessionProvider>
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
