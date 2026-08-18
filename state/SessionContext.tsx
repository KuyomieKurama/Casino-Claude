"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { User } from "@/types/user";

type SessionValue = {
  user: User | null;
  isLoggedIn: boolean;
};

const SessionContext = createContext<SessionValue | null>(null);

/**
 * Schreibgeschützter Spiegel der Serversitzung (Auftrag §4): `user` kommt als Prop aus
 * app/layout.tsx herein (Server Component, server/auth/guards.ts::getSession()) — kein
 * LocalStorage, kein Reducer, keine clientseitige TTL-Logik mehr. Anmelden, Registrieren und
 * Abmelden verändern diesen Context NICHT direkt: Sie laufen über
 * components/auth/authClient.ts gegen den Server, und `router.refresh()` (LoginForm, RegisterForm,
 * useLogout) lässt app/layout.tsx die Sitzung anschließend neu lesen. Deshalb gibt es hier auch
 * kein `hydrated`-Flag mehr — die Sitzung steht bereits im ersten, serverseitig gerenderten
 * Markup fest, ein Hydration-Skeleton wäre nur noch ein unnötiger Sprung.
 */
export function SessionProvider({ user, children }: { user: User | null; children: ReactNode }) {
  const value = useMemo<SessionValue>(() => ({ user, isLoggedIn: user !== null }), [user]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const v = useContext(SessionContext);
  if (!v) throw new Error("useSession muss innerhalb von <SessionProvider> verwendet werden.");
  return v;
}
