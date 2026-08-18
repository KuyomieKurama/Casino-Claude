import { headers as nextHeaders } from "next/headers";
import { redirect } from "next/navigation";
import { getSession } from "@/server/auth/guards";
import { safeNext } from "@/lib/safe-redirect";
import { UserShell } from "@/components/layout/UserShell";

/**
 * Serverseitiges Gating für den gesamten Nutzerbereich (Auftrag §1): ohne gültige Sitzung →
 * Redirect nach /login?next=<pfad>. middleware.ts prüft für denselben Routen-Satz bereits die
 * bloße Cookie-Präsenz und leitet ohne Cookie direkt dorthin um (Edge-Runtime, kein
 * Datenbankzugriff möglich) — dieser Aufruf ist die eigentliche, datenbankgestützte Prüfung und
 * greift zusätzlich dort, wo die Middleware nicht mehr helfen kann: Cookie vorhanden, aber die
 * Sitzung inzwischen abgelaufen, widerrufen oder das Konto gesperrt (status: "disabled" —
 * getSession() gibt in allen diesen Fällen `null` zurück, siehe server/auth/guards.ts).
 */
export default async function UserLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) {
    // x-pathname wird von middleware.ts nur gesetzt, wenn ein Cookie vorhanden war (siehe
    // dortiger Kommentar) — ohne diesen Header (z. B. ein Test, der die Middleware nicht
    // durchläuft) bleibt safeNext() beim Fallback "/profile".
    const requestHeaders = await nextHeaders();
    const currentPath = requestHeaders.get("x-pathname");
    redirect(`/login?next=${encodeURIComponent(safeNext(currentPath, "/profile"))}`);
  }
  return <UserShell>{children}</UserShell>;
}
