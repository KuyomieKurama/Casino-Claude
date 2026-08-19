import { headers as nextHeaders } from "next/headers";
import { redirect } from "next/navigation";
import { getSession } from "@/server/auth/guards";
import { safeNext } from "@/lib/safe-redirect";
import { UserShell } from "@/components/layout/UserShell";

/**
 * Serverseitiges Gating für den gesamten Nutzerbereich (Auftrag §1): ohne gültige Sitzung →
 * Redirect nach /login?next=<pfad>. Dies ist die EINZIGE Stelle, die diese Weiterleitung für die
 * (user)-Gruppe ausspricht — middleware.ts trifft bewusst keine eigene Weiterleitungsentscheidung
 * mehr (siehe dortiger Kommentar: ein aus der Edge-Middleware zurückgegebener Location-Header
 * verursachte in Produktion `TypeError: Invalid URL`). Dieser Aufruf ist die einzige verlässliche,
 * datenbankgestützte Prüfung: Cookie vorhanden, aber Sitzung inzwischen abgelaufen, widerrufen
 * oder das Konto gesperrt (status: "disabled") — getSession() gibt in allen diesen Fällen
 * (inklusive fehlendem Cookie) `null` zurück, siehe server/auth/guards.ts.
 */
export default async function UserLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) {
    // x-pathname wird von middleware.ts für jeden Request in dieser Routengruppe gesetzt (reines
    // Plumbing, kein Cookie-Vorbehalt mehr) — fehlt der Header trotzdem (z. B. ein Test, der die
    // Middleware nicht durchläuft), bleibt safeNext() beim Fallback "/profile".
    const requestHeaders = await nextHeaders();
    const currentPath = requestHeaders.get("x-pathname");
    redirect(`/login?next=${encodeURIComponent(safeNext(currentPath, "/profile"))}`);
  }
  return <UserShell>{children}</UserShell>;
}
