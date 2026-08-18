import { AlertTriangle, CheckCircle2, Database, ShieldCheck } from "lucide-react";
import type { AdminSystemStatusSnapshot } from "@/types/admin";
import { formatCredits } from "@/lib/formatters";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

export interface SystemStatusPanelProps {
  snapshot: AdminSystemStatusSnapshot;
}

/** Kleiner Baustein für einen Abschnitt, der scheitern kann — zeigt den Fehler statt eines Stacktraces. */
function SectionError({ message }: { message: string }) {
  return (
    <p role="alert" className="flex items-start gap-2 text-sm text-danger">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>Abfrage fehlgeschlagen: {message}</span>
    </p>
  );
}

/**
 * Systemstatus/Datenbankdiagnose (Admin-Auftrag §1) — reine Anzeige, keine Eingabefelder für
 * Verbindungsdaten (Auftrag: „das wäre eine SSRF-Primitive"). Überschriften ab h2 (die Seite
 * selbst trägt das h1), Tabellen mit `<th scope="col">`, Status nie nur über Farbe (Badges tragen
 * immer Text).
 */
export function SystemStatusPanel({ snapshot }: SystemStatusPanelProps) {
  return (
    <div className="space-y-6">
      <Card as="section" aria-labelledby="db-connection-title" className="space-y-3">
        <h2 id="db-connection-title" className="flex items-center gap-2 text-md font-semibold text-primary">
          <Database className="size-5 text-teal" aria-hidden="true" /> Datenbankverbindung
        </h2>
        <dl className="grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-sm text-muted">Treiber</dt>
            <dd className="text-primary">
              {snapshot.driver.name} <span className="text-sm text-muted">({snapshot.driver.description})</span>
            </dd>
          </div>
          <div>
            <dt className="text-sm text-muted">Serverversion</dt>
            <dd className="text-primary">{snapshot.serverVersion.ok ? snapshot.serverVersion.data : <SectionError message={snapshot.serverVersion.error} />}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted">Verbindung (maskiert)</dt>
            <dd className="tabular text-primary">
              {snapshot.maskedConnection ? `${snapshot.maskedConnection.host} / ${snapshot.maskedConnection.database}` : "nicht ermittelbar"}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-muted">Latenz eines einfachen SELECT 1</dt>
            <dd className="tabular text-primary">{snapshot.selectOneLatencyMs.ok ? `${snapshot.selectOneLatencyMs.data} ms` : <SectionError message={snapshot.selectOneLatencyMs.error} />}</dd>
          </div>
        </dl>
      </Card>

      <Card as="section" aria-labelledby="migrations-title" className="space-y-3">
        <h2 id="migrations-title" className="text-md font-semibold text-primary">Migrationsstand</h2>
        {snapshot.migrations.ok ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-2 text-sm text-muted">Angewendet ({snapshot.migrations.data.applied.length})</p>
              <ul className="space-y-1 text-sm">
                {snapshot.migrations.data.applied.map((m) => (
                  <li key={m.tag} className="flex items-center gap-2 text-primary">
                    <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden="true" />
                    <span className="truncate">{m.tag}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="mb-2 text-sm text-muted">Ausstehend ({snapshot.migrations.data.pending.length})</p>
              {snapshot.migrations.data.pending.length === 0 ? (
                <p className="text-sm text-success">Keine ausstehenden Migrationen.</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {snapshot.migrations.data.pending.map((m) => (
                    <li key={m.tag} className="flex items-center gap-2 text-warning">
                      <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
                      <span className="truncate">{m.tag}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : (
          <SectionError message={snapshot.migrations.error} />
        )}
      </Card>

      <Card as="section" aria-labelledby="integrity-title" className={snapshot.integrity.ok && snapshot.integrity.data.mismatches.length > 0 ? "border-danger" : undefined}>
        <h2 id="integrity-title" className="flex items-center gap-2 text-md font-semibold text-primary">
          <ShieldCheck className="size-5 text-teal" aria-hidden="true" /> Integritätsprüfung: Ledger gegen Saldo
        </h2>
        <p className="mt-1 text-sm text-muted">Summe der Ledger-Beträge je Nutzer muss dem materialisierten Wallet-Saldo entsprechen.</p>
        {snapshot.integrity.ok ? (
          snapshot.integrity.data.mismatches.length === 0 ? (
            <p className="mt-3 flex items-center gap-2 text-sm text-success">
              <CheckCircle2 className="size-4" aria-hidden="true" /> {snapshot.integrity.data.checkedWallets} Wallets geprüft, keine Abweichung.
            </p>
          ) : (
            <div className="mt-3 space-y-2">
              <Badge tone="danger" size="md">
                {snapshot.integrity.data.mismatches.length} Abweichung(en) gefunden
              </Badge>
              <div className="overflow-x-auto rounded-card border border-danger/40">
                <table className="w-full min-w-[480px] text-sm">
                  <caption className="sr-only">Nutzer mit abweichendem Saldo</caption>
                  <thead className="bg-elevated text-left text-xs uppercase tracking-wider text-muted">
                    <tr>
                      <th scope="col" className="px-3 py-2 font-medium">Nutzer-ID</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">Wallet-Saldo</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">Ledger-Summe</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">Differenz</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshot.integrity.data.mismatches.map((m) => (
                      <tr key={m.userId} className="border-t border-border-subtle">
                        <td className="px-3 py-2 text-primary">{m.userId}</td>
                        <td className="tabular px-3 py-2 text-right text-primary">{formatCredits(m.walletBalanceMinor)}</td>
                        <td className="tabular px-3 py-2 text-right text-primary">{formatCredits(m.ledgerSumMinor)}</td>
                        <td className="tabular px-3 py-2 text-right font-semibold text-danger">{formatCredits(m.differenceMinor)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )
        ) : (
          <div className="mt-3">
            <SectionError message={snapshot.integrity.error} />
          </div>
        )}
      </Card>

      <Card as="section" aria-labelledby="rowcounts-title" className="space-y-3">
        <h2 id="rowcounts-title" className="text-md font-semibold text-primary">Zeilenzahlen je Tabelle</h2>
        {snapshot.tableRowCounts.ok ? (
          <div className="overflow-x-auto rounded-card border border-border-subtle">
            <table className="w-full min-w-[420px] text-sm">
              <caption className="sr-only">Anzahl Zeilen je Datenbanktabelle</caption>
              <thead className="bg-elevated text-left text-xs uppercase tracking-wider text-muted">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">Tabelle</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Zeilen</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.tableRowCounts.data.map((row) => (
                  <tr key={row.table} className="border-t border-border-subtle">
                    <td className="px-3 py-2 text-primary">{row.table}</td>
                    <td className="tabular px-3 py-2 text-right text-primary">{row.rowCount.toLocaleString("de-DE")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <SectionError message={snapshot.tableRowCounts.error} />
        )}
      </Card>

      <Card as="section" aria-labelledby="security-title" className="space-y-3">
        <h2 id="security-title" className="text-md font-semibold text-primary">Sicherheits- und Konfigurationsstatus</h2>
        <dl className="grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-sm text-muted">IP-Rate-Limiting</dt>
            <dd className="mt-1">
              <Badge tone={snapshot.rateLimit.active ? "success" : "neutral"}>
                {snapshot.rateLimit.active ? `Aktiv (${snapshot.rateLimit.trustedProxyRangeCount} Bereich(e))` : "Inaktiv — TRUSTED_PROXY_IPS nicht gesetzt"}
              </Badge>
            </dd>
          </div>
          <div>
            <dt className="text-sm text-muted">OAuth-Provider</dt>
            <dd className="mt-1 flex flex-wrap gap-2">
              {snapshot.oauthProviders.map((p) => (
                <Badge key={p.key} tone={p.configured ? "success" : "neutral"}>
                  {p.displayName}: {p.configured ? "konfiguriert" : "nicht konfiguriert"}
                </Badge>
              ))}
            </dd>
          </div>
        </dl>
      </Card>
    </div>
  );
}

