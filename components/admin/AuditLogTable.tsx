import type { AdminAuditLogEntry } from "@/types/admin";
import { formatDateTime } from "@/lib/formatters";
import { Card } from "@/components/ui/Card";
import { Pagination } from "@/components/ui/Pagination";
import { EmptyState } from "@/components/feedback/EmptyState";
import { FileClock } from "lucide-react";

export interface AuditLogTableProps {
  entries: AdminAuditLogEntry[];
  total: number;
  prevHref?: string;
  nextHref?: string;
}

function summarizeChange(value: unknown): string {
  if (value === null || value === undefined) return "–";
  try {
    return JSON.stringify(value);
  } catch {
    return "–";
  }
}

/**
 * Audit-Log-Ansicht (Admin-Auftrag §4): rein lesend, append-only in der Datenbank — hier gibt es
 * bewusst keine Lösch-/Änderungsaktion. Blätterung über `Pagination` (echte Links, kein Client-
 * Zustand), Seitengröße kommt fest aus server/admin/audit-log-read-model.ts (keine unbegrenzte
 * Abfrage).
 */
export function AuditLogTable({ entries, total, prevHref, nextHref }: AuditLogTableProps) {
  return (
    <Card as="section" aria-labelledby="audit-log-title" className="space-y-4">
      <div>
        <h2 id="audit-log-title" className="text-md font-semibold text-primary">Audit-Log</h2>
        <p className="mt-1 text-sm text-muted">Jede Admin-Schreiboperation erzeugt hier genau einen Eintrag — Anlegen, Ändern und Löschen dieser Einträge ist über die Oberfläche nicht möglich.</p>
      </div>

      {entries.length === 0 ? (
        <EmptyState compact icon={<FileClock aria-hidden="true" />} title="Noch keine Admin-Aktionen protokolliert." />
      ) : (
        <>
          {/* Mobil: Karten */}
          <ul className="space-y-2 md:hidden">
            {entries.map((entry) => (
              <li key={entry.id} className="rounded-card border border-border-subtle bg-surface p-3 text-sm">
                <p className="tabular text-xs text-muted">{formatDateTime(entry.createdAt)}</p>
                <p className="mt-1 font-medium text-primary">{entry.action}</p>
                <p className="text-xs text-muted">
                  {entry.entityType} · {entry.entityId} · von {entry.actorUserId}
                </p>
                <p className="mt-1 break-all text-xs text-muted">
                  {summarizeChange(entry.before)} → {summarizeChange(entry.after)}
                </p>
              </li>
            ))}
          </ul>

          {/* Ab md: Tabelle */}
          <div className="hidden overflow-x-auto rounded-card border border-border-subtle md:block">
            <table className="w-full min-w-[820px] text-sm">
              <caption className="sr-only">Admin-Audit-Log mit Zeitpunkt, Urheber, Aktion, betroffener Entität sowie Vorher-/Nachher-Zustand</caption>
              <thead className="bg-elevated text-left text-xs uppercase tracking-wider text-subtle">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">Zeitpunkt</th>
                  <th scope="col" className="px-3 py-2 font-medium">Von</th>
                  <th scope="col" className="px-3 py-2 font-medium">Aktion</th>
                  <th scope="col" className="px-3 py-2 font-medium">Entität</th>
                  <th scope="col" className="px-3 py-2 font-medium">Vorher → Nachher</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id} className="border-t border-border-subtle align-top">
                    <td className="tabular whitespace-nowrap px-3 py-2 text-muted">{formatDateTime(entry.createdAt)}</td>
                    <td className="px-3 py-2 text-primary">{entry.actorUserId}</td>
                    <td className="px-3 py-2 text-primary">{entry.action}</td>
                    <td className="px-3 py-2 text-primary">
                      {entry.entityType} · {entry.entityId}
                    </td>
                    <td className="max-w-xs break-all px-3 py-2 text-xs text-muted">
                      {summarizeChange(entry.before)} → {summarizeChange(entry.after)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <Pagination
        summary={`${entries.length} von ${total} Einträgen auf dieser Seite`}
        {...(prevHref !== undefined ? { prevHref } : {})}
        {...(nextHref !== undefined ? { nextHref } : {})}
      />
    </Card>
  );
}
