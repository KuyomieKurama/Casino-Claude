"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "./authClient";

/**
 * Abmelden (Auftrag §2): beendet die Sitzung serverseitig über den better-auth-Client
 * (`/api/auth/sign-out`, dieselbe Route, gegen die server/auth/create-auth.test.ts direkt
 * testet, dass die Sitzungszeile danach nicht mehr existiert) und stößt anschließend ein
 * `router.refresh()` an, damit Server Components (Header, Nutzerbereich-Gating) den
 * abgemeldeten Zustand sofort zeigen statt erst bei der nächsten eigenständigen Navigation.
 *
 * `redirectTo` ist optional: Aufrufstellen, die selbst noch weitere Aufräumarbeiten erledigen
 * (z. B. SettingsPage.tsx vor "Lokale Daten löschen"), navigieren danach selbst.
 */
export function useLogout(): (redirectTo?: string) => Promise<void> {
  const router = useRouter();
  return useCallback(
    async (redirectTo?: string) => {
      await authClient.signOut();
      router.refresh();
      if (redirectTo) router.push(redirectTo);
    },
    [router],
  );
}
