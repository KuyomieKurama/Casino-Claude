"use client";

import { ShieldAlert } from "lucide-react";
import { useSession } from "@/state/SessionContext";
import { Card } from "@/components/ui/Card";
import { Button, LinkButton } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/feedback/EmptyState";
import { sampleAdminMetrics } from "@/data/mock-history";
import { Badge } from "@/components/ui/Badge";

/**
 * /admin ohne Rolle (§7): Hinweisseite mit direktem Umschalter „Demo-Admin-Ansicht aktivieren“.
 * Kein simulierter Login — in einer clientseitigen App wäre das Sicherheitstheater (Konzept C1).
 * Der eigentliche Admin-Bereich ist Iteration M3; hier nur das Gate und Beispiel-Kennzahlen.
 */
export function AdminGate() {
  const { hydrated, adminEnabled, setAdminEnabled } = useSession();
  if (!hydrated) return <div className="pt-6"><Skeleton className="h-64 w-full max-w-xl" /></div>;

  if (!adminEnabled) {
    return (
      <div className="mx-auto max-w-xl pt-8">
        <EmptyState
          icon={<ShieldAlert aria-hidden="true" />}
          headingLevel={1}
          title="Für diese Ansicht wird die Demo-Admin-Rolle benötigt."
          text="Diese Rolle ist reine Anzeigelogik — in einer clientseitigen App gibt es keine Sicherheitsgrenze. Echte Autorisierung gehört serverseitig. Du kannst die Demo-Ansicht hier direkt aktivieren."
          action={
            <>
              <Button variant="primary" onClick={() => setAdminEnabled(true)}>
                Demo-Admin-Ansicht aktivieren
              </Button>
              <LinkButton href="/" variant="ghost">
                Zur Startseite
              </LinkButton>
            </>
          }
        />
      </div>
    );
  }

  const m = sampleAdminMetrics;
  return (
    <div className="space-y-6 pt-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl text-primary sm:text-3xl">Admin-Dashboard <Badge tone="warning" className="ml-2 align-middle">Demo-Ansicht</Badge></h1>
          <p className="mt-1 text-sm text-muted">Iteration M3 (Spielverwaltung, Nutzer, Content, Audit-Log, Fehler-Injektor) ist noch nicht gebaut. Kennzahlen sind Beispieldaten.</p>
        </div>
        <Button variant="outline" onClick={() => setAdminEnabled(false)}>Demo-Admin-Ansicht deaktivieren</Button>
      </header>
      <p className="rounded-control border border-border-subtle bg-surface p-3 text-sm text-muted md:hidden">Für größere Bildschirme optimiert — Listen bleiben lesbar.</p>
      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Demo-Sitzungen heute", m.demoSessionsToday],
          ["Runden heute", m.roundsToday],
          ["Aktive Spiele", m.activeGames],
          ["Simulierte Fehler heute", m.simulatedErrorsToday],
        ].map(([label, value]) => (
          <Card key={String(label)}>
            <dt className="text-sm text-muted">{label} <span className="text-xs">(Beispiel)</span></dt>
            <dd className="tabular mt-1 text-xl font-semibold text-primary">{value}</dd>
          </Card>
        ))}
      </dl>
    </div>
  );
}
