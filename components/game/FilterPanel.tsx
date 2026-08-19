"use client";

import { useEffect, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { providers } from "@/data/providers";
import { mechanics, difficultyLabel } from "@/data/categories";
import { countActiveFilters, type SortKey } from "@/lib/filters";
import type { UrlCriteria } from "./useLobbyCriteria";
import type { DemoDifficulty } from "@/types/game";

const sortOptions: { value: SortKey; label: string }[] = [
  { value: "recommended", label: "Empfehlung" },
  { value: "popularity", label: "Beliebtheit" },
  { value: "newest", label: "Neuheit" },
  { value: "name", label: "Name (A–Z)" },
];

const providerOptions = [{ value: "", label: "Alle Anbieter" }, ...providers.map((p) => ({ value: p.id, label: p.name }))];
const mechanicOptions = [{ value: "", label: "Alle Mechaniken" }, ...mechanics.map((m) => ({ value: m.id, label: m.label }))];
const difficultyOptions = [
  { value: "", label: "Alle Schwierigkeiten" },
  ...(Object.keys(difficultyLabel) as DemoDifficulty[]).map((d) => ({ value: d, label: difficultyLabel[d] })),
];

type Draft = Pick<UrlCriteria, "provider" | "mechanic" | "difficulty" | "sort">;

function FilterFields({ draft, onChange, idPrefix }: { draft: Draft; onChange: (patch: Partial<Draft>) => void; idPrefix: string }) {
  return (
    <div className="flex flex-col gap-4">
      <Select id={`${idPrefix}-sort`} label="Sortierung" options={sortOptions} value={draft.sort} onChange={(e) => onChange({ sort: e.target.value as SortKey })} />
      <Select id={`${idPrefix}-provider`} label="Anbieter" options={providerOptions} value={draft.provider} onChange={(e) => onChange({ provider: e.target.value })} />
      <Select id={`${idPrefix}-mechanic`} label="Mechanik" options={mechanicOptions} value={draft.mechanic} onChange={(e) => onChange({ mechanic: e.target.value })} />
      <Select
        id={`${idPrefix}-difficulty`}
        label="Schwierigkeit"
        options={difficultyOptions}
        value={draft.difficulty}
        onChange={(e) => onChange({ difficulty: e.target.value as DemoDifficulty | "" })}
      />
    </div>
  );
}

export type FilterPanelProps = {
  criteria: UrlCriteria;
  onApply: (patch: Partial<UrlCriteria>) => void;
  onReset: () => void;
  /** sidebar: feste Spalte (Desktop, wirkt sofort) · drawer: Button + Drawer mit Übernehmen/Zurücksetzen */
  mode: "sidebar" | "drawer";
};

/**
 * Filter (§11): feste Spalte links ab lg — Änderungen wirken sofort;
 * darunter Drawer (von unten auf Mobil, seitlich ab md) mit Übernehmen/Zurücksetzen.
 */
export function FilterPanel({ criteria, onApply, onReset, mode }: FilterPanelProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(criteria);
  const activeCount = countActiveFilters(criteria);

  useEffect(() => {
    setDraft({ provider: criteria.provider, mechanic: criteria.mechanic, difficulty: criteria.difficulty, sort: criteria.sort });
  }, [criteria.provider, criteria.mechanic, criteria.difficulty, criteria.sort]);

  if (mode === "sidebar") {
    return (
      <aside aria-label="Filter" className="sticky top-[calc(var(--header-height)+1rem)] space-y-4 rounded-card border border-border-subtle bg-surface p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-primary">Filter</h2>
          {activeCount > 0 ? (
            <Button size="sm" variant="ghost" onClick={onReset}>
              Zurücksetzen
            </Button>
          ) : null}
        </div>
        <FilterFields idPrefix="desk" draft={draft} onChange={(patch) => onApply(patch)} />
      </aside>
    );
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} iconLeft={<SlidersHorizontal className="size-4" aria-hidden="true" />} aria-haspopup="dialog">
        Filter{activeCount > 0 ? ` (${activeCount})` : ""}
      </Button>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title="Filter und Sortierung"
        description="Änderungen werden erst mit „Übernehmen“ wirksam."
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                onReset();
                setOpen(false);
              }}
            >
              Zurücksetzen
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                onApply(draft);
                setOpen(false);
              }}
            >
              Übernehmen
            </Button>
          </>
        }
      >
        <FilterFields idPrefix="mob" draft={draft} onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))} />
      </Drawer>
    </>
  );
}
