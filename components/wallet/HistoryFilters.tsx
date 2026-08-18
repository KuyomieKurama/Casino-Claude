"use client";

import { useRouter } from "next/navigation";
import { Select } from "@/components/ui/Select";
import { HISTORY_RANGE_OPTIONS, type HistoryRange } from "./history-range";

export type GameOption = { value: string; label: string };

export type HistoryFiltersProps = {
  range: HistoryRange;
  gameId: string;
  gameOptions: readonly GameOption[];
};

/**
 * Filtersteuerung der Historie (Auftrag §2, „Filter bleiben in ihrer Bedeutung erhalten").
 * URL-getrieben statt eigenem Client-Zustand: ein Wechsel navigiert zu `/history` mit neuen
 * Suchparametern — app/(user)/history/page.tsx (Server Component) liest sie erneut und fragt die
 * Datenbank neu ab. Ein Filterwechsel setzt IMMER auf Seite 1 zurück (kein `cursor` in der neuen
 * URL): ein Keyset-Cursor aus der vorherigen, jetzt ungültigen Filtermenge wäre bedeutungslos.
 * Reine `<select>`-Elemente bleiben dadurch vollständig tastatur- und screenreader-bedienbar,
 * ganz ohne eigene ARIA-Nachbauten.
 */
export function HistoryFilters({ range, gameId, gameOptions }: HistoryFiltersProps) {
  const router = useRouter();

  const navigate = (next: { range?: HistoryRange; gameId?: string }) => {
    const params = new URLSearchParams();
    const nextRange = next.range ?? range;
    const nextGameId = next.gameId ?? gameId;
    if (nextRange !== "all") params.set("range", nextRange);
    if (nextGameId) params.set("gameId", nextGameId);
    router.push(params.size > 0 ? `/history?${params.toString()}` : "/history");
  };

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Select label="Zeitraum" value={range} onChange={(e) => navigate({ range: e.target.value as HistoryRange })} options={HISTORY_RANGE_OPTIONS} />
      <Select label="Spiel" value={gameId} onChange={(e) => navigate({ gameId: e.target.value })} options={[{ value: "", label: "Alle Spiele" }, ...gameOptions]} />
    </div>
  );
}
