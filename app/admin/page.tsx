import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { requireAdmin, UnauthenticatedError, UnauthorizedError } from "@/server/auth/guards";
import { db } from "@/server/db/client";
import { resolveSystemStatus } from "@/server/admin/system-status";
import { EmptyState } from "@/components/feedback/EmptyState";
import { LinkButton } from "@/components/ui/Button";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { SystemStatusPanel } from "@/components/admin/SystemStatusPanel";

export const metadata: Metadata = { title: "Admin" };

/**
 * Serverseitige Zugriffsprüfung (Admin-Auftrag §1, unverändert seit dem ursprünglichen Gate):
 * requireAdmin() wirft UnauthenticatedError (keine Sitzung → Redirect zur Anmeldung) oder
 * UnauthorizedError (angemeldet, aber keine aktive Admin-Rolle bzw. gesperrtes Konto,
 * status: "disabled" → eigene "Kein Zugriff"-Ansicht, KEIN Redirect, weil die Person ja bereits
 * angemeldet ist).
 *
 * Ab hier NEU (Admin-Auftrag §1): Der Dashboard-Inhalt zeigt den echten Systemstatus
 * (server/admin/system-status.ts) statt `sampleAdminMetrics` — Datenbanktreiber, Serverversion,
 * maskierte Verbindung, Migrationsstand, Zeilenzahlen, Integritätsprüfung, Rate-Limiting- und
 * OAuth-Konfigurationsstatus. Keine Geheimnisse, kein Umschalten der Datenbank, kein
 * Verbindungsstring-Eingabefeld (SSRF-Risiko, siehe Auftrag).
 */
export default async function AdminPage() {
  try {
    await requireAdmin();
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      redirect(`/login?next=${encodeURIComponent("/admin")}`);
    }
    if (error instanceof UnauthorizedError) {
      return (
        <div className="anim-panel-in mx-auto max-w-xl pt-8">
          <EmptyState
            className="edge-light"
            icon={<ShieldAlert aria-hidden="true" />}
            headingLevel={1}
            title="Kein Zugriff auf den Admin-Bereich."
            text="Dieser Bereich ist Konten mit aktiver Admin-Rolle vorbehalten."
            action={<LinkButton href="/" className="focus-glow">Zur Startseite</LinkButton>}
          />
        </div>
      );
    }
    throw error;
  }

  const snapshot = await resolveSystemStatus(db);

  return (
    <div className="anim-panel-in">
      <AdminHeader />
      <div className="mx-auto max-w-6xl space-y-xl px-4 py-6 sm:px-6">
        <header>
          <h1 className="font-display text-2xl text-primary sm:text-3xl">Admin-Dashboard</h1>
          <p className="mt-1 text-sm text-muted">Systemstatus und Datenbankdiagnose — reine Anzeige, kein Umschalten der Datenbank.</p>
        </header>
        <SystemStatusPanel snapshot={snapshot} />
      </div>
    </div>
  );
}
