"use client";

import { Check } from "lucide-react";
import { Tabs } from "@/components/ui/Tabs";
import { lobbyCategories } from "@/data/categories";
import { paramsFromCriteria, type LobbyCategory } from "@/lib/filters";
import type { UrlCriteria } from "./useLobbyCriteria";

/**
 * Aktive Kategorie nicht allein über Farbe erkennbar (Auftrag §3): `Tabs` markiert den aktiven
 * Reiter zwar bereits mit `aria-current`/violetter Unterkante (`bg-accent-strong`), für sehende
 * Nutzer ohne Farbwahrnehmung bräuchte es aber ein zweites Merkmal. `label` akzeptiert ReactNode —
 * hier wird ein Häkchen samt fetter Schrift nur beim aktiven Reiter ergänzt, ohne `Tabs` selbst
 * anzufassen (gesperrte Datei). Das Häkchen spielt beim Wechsel `.anim-state-pop` ab: sichtbare
 * Bestätigung der Auswahl, nicht nur ein Farbwechsel. Farbe des Häkchens: `text-accent` (violett)
 * statt Gold (Auftrag Etappe 3 §5) — die Unterkante selbst kommt unverändert aus `Tabs` (gesperrte
 * Datei) und bleibt dort eine Haarlinie, keine gefüllte Fläche.
 */
export function CategoryTabs({ criteria, counts }: { criteria: UrlCriteria; counts?: Partial<Record<LobbyCategory, number>> }) {
  const items = lobbyCategories.map((c) => {
    const active = c.id === criteria.cat;
    const qs = paramsFromCriteria({ ...criteria, cat: c.id }).toString();
    return {
      id: c.id,
      label: active ? (
        <span className="inline-flex items-center gap-1.5 font-semibold">
          <Check className="anim-state-pop size-3.5 shrink-0 text-accent" aria-hidden="true" />
          {c.label}
        </span>
      ) : (
        c.label
      ),
      href: qs ? `/casino?${qs}` : "/casino",
      count: counts?.[c.id],
    };
  });
  return <Tabs items={items} activeId={criteria.cat} ariaLabel="Kategorien" />;
}
