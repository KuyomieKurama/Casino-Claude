"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, LogOut, Unlock } from "lucide-react";
import type { AdminUserListItem } from "@/types/admin";
import { formatDate, formatDuration } from "@/lib/formatters";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Pagination } from "@/components/ui/Pagination";
import { useToast } from "@/components/ui/Toast";
import { ConfirmDialog } from "./ConfirmDialog";

export interface UsersTableProps {
  items: AdminUserListItem[];
  currentAdminId: string;
  page: number;
  pageCount: number;
  total: number;
}

type PendingAction = { kind: "lock" | "unlock"; userId: string; name: string } | { kind: "revoke"; userId: string; name: string } | null;

const ERROR_MESSAGES: Record<string, string> = {
  SELF_LOCK_FORBIDDEN: "Ein Admin kann sich nicht selbst sperren. Was tun: Ein anderes Admin-Konto muss diese Aktion ausführen.",
  NOT_FOUND: "Dieses Konto wurde nicht gefunden. Was tun: Seite neu laden — das Konto wurde möglicherweise bereits geändert.",
  UNAUTHENTICATED: "Sitzung abgelaufen. Was tun: Erneut anmelden.",
  UNAUTHORIZED: "Keine Berechtigung für diese Aktion.",
};

function rgSummaryText(item: AdminUserListItem): string {
  if (!item.rg) return "Keine Einstellungen";
  const parts: string[] = [];
  if (item.rg.selfExcluded) parts.push("Selbstsperre aktiv");
  if (item.rg.sessionLimitMinutes) parts.push(`Limit ${formatDuration(item.rg.sessionLimitMinutes * 60_000)}`);
  if (item.rg.pausedUntil) parts.push("pausiert");
  return parts.length > 0 ? parts.join(", ") : "Keine Einschränkung";
}

/**
 * Nutzerverwaltung (Admin-Auftrag §3). Rolle wird bewusst NUR als Text angezeigt, nirgends als
 * Eingabefeld — die Admin-Rolle ist über die Oberfläche weder vergebbar noch entziehbar
 * (ausschließlich über ADMIN_BOOTSTRAP_EMAIL, siehe CLAUDE.md). Der Grund steht sichtbar neben
 * der Spalte, nicht nur im Code-Kommentar.
 */
export function UsersTable({ items, currentAdminId, page, pageCount, total }: UsersTableProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, setPending] = useState<PendingAction>(null);
  const [busy, setBusy] = useState(false);

  async function runAction(action: NonNullable<PendingAction>) {
    setBusy(true);
    try {
      const url = action.kind === "revoke" ? `/api/admin/users/${action.userId}/sessions` : `/api/admin/users/${action.userId}/status`;
      const response = await fetch(url, {
        method: "POST",
        headers: action.kind === "revoke" ? undefined : { "content-type": "application/json" },
        body: action.kind === "revoke" ? undefined : JSON.stringify({ status: action.kind === "lock" ? "disabled" : "active" }),
      });
      const body = (await response.json().catch(() => null)) as { success?: boolean; error?: string } | null;
      if (!response.ok || !body?.success) {
        const code = body?.error ?? "SERVER_ERROR";
        toast({ tone: "danger", title: "Aktion fehlgeschlagen", description: ERROR_MESSAGES[code] ?? "Unbekannter Fehler. Was tun: Später erneut versuchen." });
        return;
      }
      toast({ tone: "success", title: action.kind === "revoke" ? "Sitzungen widerrufen." : action.kind === "lock" ? "Konto gesperrt." : "Konto entsperrt." });
      router.refresh();
    } finally {
      setBusy(false);
      setPending(null);
    }
  }

  function hrefForPage(target: number): string {
    return target <= 1 ? "/admin/users" : `/admin/users?page=${target}`;
  }

  return (
    <Card as="section" aria-labelledby="users-title" className="space-y-4">
      <div>
        <h2 id="users-title" className="text-md font-semibold text-primary">Nutzer</h2>
        <p className="mt-1 text-sm text-muted">
          Die Admin-Rolle ist über diese Oberfläche nicht vergebbar oder entziehbar — sie kommt ausschließlich über <code>ADMIN_BOOTSTRAP_EMAIL</code> beim Seed. Das verhindert eine Eskalationskette über die Web-Oberfläche.
        </p>
      </div>

      {/* Mobil: Karten */}
      <ul className="space-y-2 md:hidden">
        {items.map((item) => (
          <li key={item.id} className="rounded-card border border-border-subtle bg-surface p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-primary">{item.name}</p>
                <p className="truncate text-xs text-muted">{item.email}</p>
              </div>
              <Badge tone={item.status === "active" ? "success" : "danger"}>{item.status === "active" ? "Aktiv" : "Gesperrt"}</Badge>
            </div>
            <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted">
              <div><dt className="inline">Rolle: </dt><dd className="inline text-primary">{item.role === "admin" ? "Admin" : "Nutzer"}</dd></div>
              <div><dt className="inline">Gast: </dt><dd className="inline text-primary">{item.isGuest ? "Ja" : "Nein"}</dd></div>
              <div><dt className="inline">Runden: </dt><dd className="inline text-primary">{item.roundCount}</dd></div>
              <div><dt className="inline">Erstellt: </dt><dd className="inline text-primary">{formatDate(item.createdAt)}</dd></div>
            </dl>
            <p className="mt-1 text-xs text-muted">RG: {rgSummaryText(item)}</p>
            <RowActions item={item} currentAdminId={currentAdminId} onLock={() => setPending({ kind: "lock", userId: item.id, name: item.name })} onUnlock={() => setPending({ kind: "unlock", userId: item.id, name: item.name })} onRevoke={() => setPending({ kind: "revoke", userId: item.id, name: item.name })} />
          </li>
        ))}
      </ul>

      {/* Ab md: Tabelle */}
      <div className="hidden overflow-x-auto rounded-card border border-border-subtle md:block">
        <table className="w-full min-w-[860px] text-sm">
          <caption className="sr-only">Nutzerliste mit Rolle, Status, Gastkennzeichen, Erstellungsdatum, Rundenzahl und RG-Kurzstatus</caption>
          <thead className="bg-elevated text-left text-xs uppercase tracking-wider text-subtle">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">Nutzer</th>
              <th scope="col" className="px-3 py-2 font-medium">Rolle</th>
              <th scope="col" className="px-3 py-2 font-medium">Status</th>
              <th scope="col" className="px-3 py-2 font-medium">Gast</th>
              <th scope="col" className="px-3 py-2 font-medium">Erstellt</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Runden</th>
              <th scope="col" className="px-3 py-2 font-medium">RG-Status</th>
              <th scope="col" className="px-3 py-2 font-medium">Aktionen</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-t border-border-subtle align-top">
                <td className="px-3 py-2">
                  <p className="text-primary">{item.name}</p>
                  <p className="text-xs text-muted">{item.email}</p>
                </td>
                <td className="px-3 py-2 text-primary">{item.role === "admin" ? "Admin" : "Nutzer"}</td>
                <td className="px-3 py-2">
                  <Badge tone={item.status === "active" ? "success" : "danger"}>{item.status === "active" ? "Aktiv" : "Gesperrt"}</Badge>
                </td>
                <td className="px-3 py-2 text-primary">{item.isGuest ? "Ja" : "Nein"}</td>
                <td className="tabular px-3 py-2 text-primary">{formatDate(item.createdAt)}</td>
                <td className="tabular px-3 py-2 text-right text-primary">{item.roundCount}</td>
                <td className="px-3 py-2 text-primary">{rgSummaryText(item)}</td>
                <td className="px-3 py-2">
                  <RowActions item={item} currentAdminId={currentAdminId} onLock={() => setPending({ kind: "lock", userId: item.id, name: item.name })} onUnlock={() => setPending({ kind: "unlock", userId: item.id, name: item.name })} onRevoke={() => setPending({ kind: "revoke", userId: item.id, name: item.name })} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pagination
        summary={`Seite ${page} von ${pageCount}, ${total} Nutzer`}
        {...(page > 1 ? { prevHref: hrefForPage(page - 1) } : {})}
        {...(page < pageCount ? { nextHref: hrefForPage(page + 1) } : {})}
      />

      <ConfirmDialog
        open={pending !== null}
        onClose={() => setPending(null)}
        onConfirm={() => pending && runAction(pending)}
        busy={busy}
        tone="danger"
        title={pending?.kind === "revoke" ? `Sitzungen von „${pending.name}" widerrufen?` : pending?.kind === "lock" ? `Konto „${pending.name}" sperren?` : `Konto „${pending?.name}" entsperren?`}
        description={
          pending?.kind === "revoke"
            ? "Alle aktiven Sitzungen dieses Kontos werden sofort beendet. Der Nutzer muss sich neu anmelden."
            : pending?.kind === "lock"
              ? "Das Konto kann sich bis zur Entsperrung nicht mehr anmelden."
              : "Das Konto kann sich wieder normal anmelden."
        }
        confirmLabel={pending?.kind === "revoke" ? "Sitzungen widerrufen" : pending?.kind === "lock" ? "Sperren" : "Entsperren"}
      />
    </Card>
  );
}

function RowActions({ item, currentAdminId, onLock, onUnlock, onRevoke }: { item: AdminUserListItem; currentAdminId: string; onLock: () => void; onUnlock: () => void; onRevoke: () => void }) {
  const isSelf = item.id === currentAdminId;
  return (
    <div className="flex flex-wrap gap-2">
      {item.status === "active" ? (
        isSelf ? (
          <p className="text-xs text-muted">Ein Admin kann sich nicht selbst sperren.</p>
        ) : (
          <Button variant="outline" size="md" onClick={onLock} iconLeft={<Lock className="size-4" aria-hidden="true" />}>
            Sperren
          </Button>
        )
      ) : (
        <Button variant="outline" size="md" onClick={onUnlock} iconLeft={<Unlock className="size-4" aria-hidden="true" />}>
          Entsperren
        </Button>
      )}
      <Button variant="ghost" size="md" onClick={onRevoke} iconLeft={<LogOut className="size-4" aria-hidden="true" />}>
        Sitzungen widerrufen
      </Button>
    </div>
  );
}
