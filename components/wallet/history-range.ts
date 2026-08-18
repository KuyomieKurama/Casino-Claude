import type { SelectOption } from "@/components/ui/Select";
import type { HistoryRange } from "@/types/history";

export type { HistoryRange } from "@/types/history";

/** Anzeige-Beschriftungen für den Zeitraum-Filter (Auftrag §2: Bedeutung unverändert zum bisherigen Client-Filter). */
export const HISTORY_RANGE_OPTIONS: readonly SelectOption[] = [
  { value: "all", label: "Gesamt" },
  { value: "today", label: "Letzte 24 Stunden" },
  { value: "7d", label: "Letzte 7 Tage" },
  { value: "30d", label: "Letzte 30 Tage" },
] satisfies readonly { value: HistoryRange; label: string }[];
