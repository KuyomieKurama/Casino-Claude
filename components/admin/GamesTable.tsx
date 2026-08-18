"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Power, PowerOff } from "lucide-react";
import type { AdminCatalogStatus, AdminGameItem, AdminGameModeItem } from "@/types/admin";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { ConfirmDialog } from "./ConfirmDialog";

export interface GamesTableProps {
  items: AdminGameItem[];
}

type PendingStatusChange = { kind: "game" | "mode"; id: string; label: string; nextStatus: AdminCatalogStatus } | null;

const ERROR_MESSAGES: Record<string, string> = {
  NO_ACTIVE_MODE: "Ein Titel kann nicht ohne mindestens einen aktiven Modus aktiv sein. Was tun: Zuerst einen Modus aktivieren.",
  LAST_ACTIVE_MODE_OF_ACTIVE_GAME: "Dies ist der letzte aktive Modus eines aktiven Titels. Was tun: Zuerst einen anderen Modus aktivieren oder den Titel deaktivieren.",
  NOT_FOUND: "Nicht gefunden. Was tun: Seite neu laden.",
};

function statusBadge(status: AdminCatalogStatus) {
  return <Badge tone={status === "active" ? "success" : "neutral"}>{status === "active" ? "Aktiv" : "Inaktiv"}</Badge>;
}

/**
 * Spielverwaltung (Admin-Auftrag §2). `paytable_key`, `engine_key` und RTP sind hier bewusst
 * NICHT änderbar — nur Anzeige mit Begründung (Auftrag: „der ausgewiesene RTP wird aus der
 * geprüften Auszahlungstabelle berechnet; wäre er über die Oberfläche editierbar, könnte die
 * Anzeige von der Simulation abweichen").
 */
export function GamesTable({ items }: GamesTableProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, setPending] = useState<PendingStatusChange>(null);
  const [busy, setBusy] = useState(false);
  const [sortOrderDrafts, setSortOrderDrafts] = useState<Record<string, string>>({});

  async function confirmStatusChange() {
    if (!pending) return;
    setBusy(true);
    try {
      const url = pending.kind === "game" ? `/api/admin/games/${pending.id}/status` : `/api/admin/game-modes/${pending.id}/status`;
      const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: pending.nextStatus }) });
      const body = (await response.json().catch(() => null)) as { success?: boolean; error?: string } | null;
      if (!response.ok || !body?.success) {
        const code = body?.error ?? "SERVER_ERROR";
        toast({ tone: "danger", title: "Aktion fehlgeschlagen", description: ERROR_MESSAGES[code] ?? "Unbekannter Fehler. Was tun: Später erneut versuchen." });
        return;
      }
      toast({ tone: "success", title: `„${pending.label}" ist jetzt ${pending.nextStatus === "active" ? "aktiv" : "inaktiv"}.` });
      router.refresh();
    } finally {
      setBusy(false);
      setPending(null);
    }
  }

  async function updateListing(gameId: string, patch: { isFeatured?: boolean; sortOrder?: number }) {
    const response = await fetch(`/api/admin/games/${gameId}/listing`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(patch) });
    const body = (await response.json().catch(() => null)) as { success?: boolean; error?: string } | null;
    if (!response.ok || !body?.success) {
      toast({ tone: "danger", title: "Änderung fehlgeschlagen", description: ERROR_MESSAGES[body?.error ?? ""] ?? "Unbekannter Fehler. Was tun: Später erneut versuchen." });
      return;
    }
    toast({ tone: "success", title: "Änderung gespeichert." });
    router.refresh();
  }

  return (
    <Card as="section" aria-labelledby="games-title" className="space-y-4">
      <div>
        <h2 id="games-title" className="text-md font-semibold text-primary">Titel und Modi</h2>
        <p className="mt-1 text-sm text-muted">
          Auszahlungstabelle, Engine und RTP sind hier nicht änderbar: Der ausgewiesene RTP wird aus der geprüften Auszahlungstabelle berechnet — eine editierbare Anzeige könnte von der Simulation abweichen.
        </p>
      </div>

      <ul className="space-y-4">
        {items.map((game) => (
          <li key={game.id} className="rounded-card border border-border-subtle p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-medium text-primary">{game.name}</p>
                <p className="text-xs text-muted">{game.slug}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {statusBadge(game.status)}
                <Button
                  variant="outline"
                  size="md"
                  iconLeft={game.status === "active" ? <PowerOff className="size-4" aria-hidden="true" /> : <Power className="size-4" aria-hidden="true" />}
                  onClick={() => setPending({ kind: "game", id: game.id, label: game.name, nextStatus: game.status === "active" ? "inactive" : "active" })}
                >
                  {game.status === "active" ? "Deaktivieren" : "Aktivieren"}
                </Button>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-4">
              <Checkbox
                label="Hervorgehoben (is_featured)"
                checked={game.isFeatured}
                onChange={(e) => updateListing(game.id, { isFeatured: e.target.checked })}
              />
              <div className="flex items-end gap-2">
                <Input
                  label="Sortierung"
                  type="number"
                  min={0}
                  value={sortOrderDrafts[game.id] ?? String(game.sortOrder)}
                  onChange={(e) => setSortOrderDrafts((prev) => ({ ...prev, [game.id]: e.target.value }))}
                  containerClassName="w-28"
                />
                <Button
                  variant="outline"
                  size="md"
                  onClick={() => {
                    const raw = sortOrderDrafts[game.id];
                    const value = raw !== undefined ? Number(raw) : game.sortOrder;
                    if (Number.isInteger(value) && value >= 0) updateListing(game.id, { sortOrder: value });
                  }}
                >
                  Übernehmen
                </Button>
              </div>
            </div>

            <ModesList modes={game.modes} onRequestStatusChange={(mode) => setPending({ kind: "mode", id: mode.id, label: mode.label, nextStatus: mode.status === "active" ? "inactive" : "active" })} />
          </li>
        ))}
      </ul>

      <ConfirmDialog
        open={pending !== null}
        onClose={() => setPending(null)}
        onConfirm={confirmStatusChange}
        busy={busy}
        tone={pending?.nextStatus === "inactive" ? "danger" : "default"}
        title={`„${pending?.label}" ${pending?.nextStatus === "active" ? "aktivieren" : "deaktivieren"}?`}
        description={pending?.kind === "game" ? "Ein aktiver Titel benötigt mindestens einen aktiven Modus." : "Der letzte aktive Modus eines aktiven Titels lässt sich nicht deaktivieren."}
        confirmLabel={pending?.nextStatus === "active" ? "Aktivieren" : "Deaktivieren"}
      />
    </Card>
  );
}

function ModesList({ modes, onRequestStatusChange }: { modes: AdminGameModeItem[]; onRequestStatusChange: (mode: AdminGameModeItem) => void }) {
  if (modes.length === 0) {
    return <p className="mt-3 text-sm text-warning">Kein Modus vorhanden — dieser Titel kann nicht aktiviert werden.</p>;
  }
  return (
    <div className="mt-3 overflow-x-auto rounded-card border border-border-subtle">
      <table className="w-full min-w-[520px] text-sm">
        <caption className="sr-only">Modi dieses Titels mit Status, Engine und Paytable-Schlüssel</caption>
        <thead className="bg-elevated text-left text-xs uppercase tracking-wider text-muted">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">Modus</th>
            <th scope="col" className="px-3 py-2 font-medium">Engine</th>
            <th scope="col" className="px-3 py-2 font-medium">Paytable-Schlüssel</th>
            <th scope="col" className="px-3 py-2 font-medium">Status</th>
            <th scope="col" className="px-3 py-2 font-medium">Aktion</th>
          </tr>
        </thead>
        <tbody>
          {modes.map((mode) => (
            <tr key={mode.id} className="border-t border-border-subtle">
              <td className="px-3 py-2 text-primary">{mode.label}</td>
              <td className="px-3 py-2 text-primary">{mode.engineKey}</td>
              <td className="px-3 py-2 text-primary">{mode.paytableKey ?? "– (kein RTP ausgewiesen)"}</td>
              <td className="px-3 py-2">{statusBadge(mode.status)}</td>
              <td className="px-3 py-2">
                <Button variant="ghost" size="md" onClick={() => onRequestStatusChange(mode)}>
                  {mode.status === "active" ? "Deaktivieren" : "Aktivieren"}
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
