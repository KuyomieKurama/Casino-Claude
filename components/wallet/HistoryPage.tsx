import type { Transaction } from "@/types/transaction";
import type { HistoryRange } from "@/types/history";
import { findGameById } from "@/data/catalog";
import { Pagination } from "@/components/ui/Pagination";
import { HistoryFilters, type GameOption } from "./HistoryFilters";
import { TransactionList } from "./TransactionList";

export type HistoryPageProps = {
  range: HistoryRange;
  gameId: string;
  entries: readonly Transaction[];
  /** Alle Spielmodi, in denen der Nutzer je gebucht hat — Grundlage des "Spiel"-Filters. */
  gameOptions: readonly string[];
  /** Gesamtzahl unter den aktuellen Filtern (nicht nur der aktuellen Seite). */
  total: number;
  /** 1-basiert — aus der Zahl der bisher verwendeten Keyset-Cursor berechnet (siehe page.tsx). */
  pageNumber: number;
  prevHref?: string;
  nextHref?: string;
};

/** Spielhistorie (§8.8): Filter nach Zeitraum und Spiel, serverseitig paginiert (Auftrag §2). */
export function HistoryPage({ range, gameId, entries, gameOptions, total, pageNumber, prevHref, nextHref }: HistoryPageProps) {
  const gameSelectOptions: GameOption[] = gameOptions
    .map((id) => {
      const game = findGameById(id);
      return game ? { value: id, label: game.name } : null;
    })
    .filter((option): option is GameOption => option !== null);

  const statusText = total === 0 ? "Keine Buchungen." : `${total} ${total === 1 ? "Buchung" : "Buchungen"} insgesamt, Seite ${pageNumber}.`;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl text-primary sm:text-3xl">Spielhistorie</h1>
        <p className="mt-1 text-sm text-muted">Jede Bewegung mit Kontostand danach. Einsatz und Ergebnis derselben Runde teilen eine Runden-ID.</p>
      </header>
      <HistoryFilters range={range} gameId={gameId} gameOptions={gameSelectOptions} />
      <p className="text-sm text-muted" aria-live="polite">
        {statusText}
      </p>
      <TransactionList transactions={entries} hydrated sortBy="given" />
      {entries.length > 0 ? <Pagination prevHref={prevHref} nextHref={nextHref} summary={`Seite ${pageNumber}`} /> : null}
    </div>
  );
}
