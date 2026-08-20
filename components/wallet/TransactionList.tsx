"use client";

import { History } from "lucide-react";
import type { Transaction, TransactionType } from "@/types/transaction";
import { games } from "@/data/catalog";
import { isSampleTransaction } from "@/data/mock-history";
import { formatCredits, formatCreditsSigned, formatDateTime } from "@/lib/formatters";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/feedback/EmptyState";
import { LinkButton } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/cn";

const typeLabel: Record<TransactionType, string> = {
  credit: "Credits hinzugefügt",
  bet: "Einsatz",
  win: "Rückgabe",
  bonus_grant: "Bonus gutgeschrieben",
  free_spin: "Freirunde eingesetzt",
  reset: "Zurückgesetzt",
};

const gameName = (id?: string) => (id ? (games.find((g) => g.id === id)?.name ?? "Unbekanntes Spiel") : "–");

/** Vorzeichen und Farbe: Rückgabe unter Einsatz wird nie als Gewinn gefeiert — nur netto positive Werte sind grün. */
function amountClass(tx: Transaction): string {
  if (tx.amountMinor > 0 && tx.type === "win") return "text-success";
  if (tx.amountMinor > 0) return "text-accent";
  return "text-primary";
}

export type TransactionListProps = {
  transactions: readonly Transaction[];
  hydrated: boolean;
  limit?: number;
  className?: string;
  emptyAction?: React.ReactNode;
  /** seq: neueste zuerst (Standard) · given: Reihenfolge wie übergeben */
  sortBy?: "seq" | "given";
};

/**
 * Historie: Tabelle auf Desktop, Karten auf Mobil (§11). Reihenfolge nach seq (absteigend),
 * Beispieldaten sind als solche gekennzeichnet.
 */
export function TransactionList({ transactions, hydrated, limit, className, emptyAction, sortBy = "seq" }: TransactionListProps) {
  if (!hydrated) {
    return (
      <div className={cn("space-y-2", className)} aria-busy="true">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    );
  }

  const ordered = sortBy === "seq" ? [...transactions].sort((a, b) => b.seq - a.seq) : [...transactions];
  const rows = ordered.slice(0, limit ?? transactions.length);

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<History aria-hidden="true" />}
        title="Noch keine Buchungen."
        text="Sobald du eine Runde spielst oder Credits hinzufügst, erscheint hier jede Bewegung mit Kontostand danach."
        // Kontoverwaltung bleibt golden-frei (§4/Auftrag): "outline" statt "primary" — Gold bleibt
        // dem Spielbereich vorbehalten, auch wenn dieser Leerzustand dorthin verlinkt.
        action={emptyAction ?? <LinkButton href="/casino" variant="outline">Zur Lobby</LinkButton>}
        className={className}
      />
    );
  }

  return (
    <div className={className}>
      {/* Mobil: Karten — stagger-list lässt Zeilen nacheinander eintreten (app/globals.css), nicht
          schlagartig. Der Container wird bei jeder Filter-/Seitennavigation frisch gerendert
          (HistoryPage ist URL-getrieben), die Eintritts-Bewegung spielt deshalb bei jedem
          Seitenwechsel erneut ab und macht sichtbar, dass sich der Inhalt geändert hat. */}
      <ul className="stagger-list space-y-2 md:hidden">
        {rows.map((tx) => (
          <li key={tx.id} className="rounded-card border border-border-subtle bg-surface p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-primary">{typeLabel[tx.type]}</p>
                <p className="truncate text-xs text-muted">
                  {tx.gameId ? gameName(tx.gameId) : "Wallet"} · {formatDateTime(tx.createdAt)}
                </p>
              </div>
              <div className="text-right">
                <p className={cn("tabular text-sm font-semibold", amountClass(tx))}>{formatCreditsSigned(tx.amountMinor)}</p>
                <p className="tabular text-xs text-muted">Stand {formatCredits(tx.balanceAfterMinor)}</p>
              </div>
            </div>
            {isSampleTransaction(tx) ? (
              <Badge tone="neutral" className="mt-2">
                Beispieldaten
              </Badge>
            ) : null}
          </li>
        ))}
      </ul>

      {/* Ab md: Tabelle */}
      <div className="hidden overflow-x-auto rounded-card border border-border-subtle md:block">
        <table className="w-full min-w-[640px] text-sm">
          <caption className="sr-only">Transaktionen mit Betrag und Kontostand danach, neueste zuerst</caption>
          <thead className="bg-elevated text-left text-xs uppercase tracking-wider text-subtle">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium">Zeitpunkt</th>
              <th scope="col" className="px-4 py-3 font-medium">Vorgang</th>
              <th scope="col" className="px-4 py-3 font-medium">Spiel</th>
              <th scope="col" className="px-4 py-3 text-right font-medium">Betrag (Credits)</th>
              <th scope="col" className="px-4 py-3 text-right font-medium">Kontostand danach</th>
            </tr>
          </thead>
          <tbody className="stagger-list">
            {rows.map((tx) => (
              <tr key={tx.id} className="border-t border-border-subtle">
                <td className="tabular whitespace-nowrap px-4 py-3 text-muted">{formatDateTime(tx.createdAt)}</td>
                <td className="px-4 py-3 text-primary">
                  {typeLabel[tx.type]}
                  {isSampleTransaction(tx) ? (
                    <Badge tone="neutral" className="ml-2">
                      Beispiel
                    </Badge>
                  ) : null}
                </td>
                <td className="px-4 py-3 text-primary/90">{tx.gameId ? gameName(tx.gameId) : "Wallet"}</td>
                <td className={cn("tabular px-4 py-3 text-right font-semibold", amountClass(tx))}>{formatCreditsSigned(tx.amountMinor)}</td>
                <td className="tabular px-4 py-3 text-right text-primary">{formatCredits(tx.balanceAfterMinor)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
