import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { requireAdmin, UnauthenticatedError, UnauthorizedError } from "@/server/auth/guards";
import { EmptyState } from "@/components/feedback/EmptyState";
import { LinkButton } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { sampleAdminMetrics } from "@/data/mock-history";

export const metadata: Metadata = { title: "Admin" };

/**
 * Serverseitige Zugriffsprüfung (Auftrag §1): requireAdmin() wirft UnauthenticatedError (keine
 * Sitzung → Redirect zur Anmeldung) oder UnauthorizedError (angemeldet, aber keine aktive
 * Admin-Rolle bzw. gesperrtes Konto, status: "disabled" → eigene "Kein Zugriff"-Ansicht, KEIN
 * Redirect, weil die Person ja bereits angemeldet ist). components/admin/AdminGate.tsx (offener
 * clientseitiger Umschalter ohne echten Schutz) entfällt ersatzlos.
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

  const m = sampleAdminMetrics;
  return (
    <div className="anim-panel-in space-y-6 pt-6">
      <header>
        <h1 className="font-display text-2xl text-primary sm:text-3xl">
          Admin-Dashboard <Badge tone="warning" className="ml-2 align-middle">Beispieldaten</Badge>
        </h1>
        <p className="mt-1 text-sm text-muted">Spielverwaltung, Nutzer, Content und Audit-Log sind noch nicht gebaut. Die Kennzahlen unten sind Beispieldaten.</p>
      </header>
      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Demo-Sitzungen heute", m.demoSessionsToday],
          ["Runden heute", m.roundsToday],
          ["Aktive Spiele", m.activeGames],
          ["Simulierte Fehler heute", m.simulatedErrorsToday],
        ].map(([label, value]) => (
          <Card key={String(label)}>
            <dt className="text-sm text-muted">
              {label} <span className="text-xs">(Beispiel)</span>
            </dt>
            <dd className="tabular mt-1 text-xl font-semibold text-primary">{value}</dd>
          </Card>
        ))}
      </dl>
    </div>
  );
}
